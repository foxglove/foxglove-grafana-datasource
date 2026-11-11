package plugin

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/proxy"
)

// socksRecorder is a minimal SOCKS5 server (no-auth and username/password,
// CONNECT only) that records the username and every CONNECT target. It stands
// in for the Grafana Cloud PDC proxy.
type socksRecorder struct {
	ln       net.Listener
	mu       sync.Mutex
	targets  []string
	username string
}

func newSocksRecorder(t *testing.T) *socksRecorder {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	s := &socksRecorder{ln: ln}
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go s.serve(c)
		}
	}()
	t.Cleanup(func() { _ = ln.Close() })
	return s
}

func (s *socksRecorder) Targets() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.targets...)
}

func (s *socksRecorder) serve(c net.Conn) {
	defer c.Close()
	buf := make([]byte, 262)
	// Greeting: VER NMETHODS METHODS...
	if _, err := io.ReadFull(c, buf[:2]); err != nil {
		return
	}
	methods := buf[2 : 2+int(buf[1])]
	if _, err := io.ReadFull(c, methods); err != nil {
		return
	}
	userPass := false
	for _, m := range methods {
		if m == 0x02 {
			userPass = true
		}
	}
	if userPass {
		_, _ = c.Write([]byte{0x05, 0x02})
		// RFC 1929: VER ULEN UNAME PLEN PASSWD
		if _, err := io.ReadFull(c, buf[:2]); err != nil {
			return
		}
		user := make([]byte, buf[1])
		if _, err := io.ReadFull(c, user); err != nil {
			return
		}
		if _, err := io.ReadFull(c, buf[:1]); err != nil {
			return
		}
		if _, err := io.ReadFull(c, make([]byte, buf[0])); err != nil {
			return
		}
		s.mu.Lock()
		s.username = string(user)
		s.mu.Unlock()
		_, _ = c.Write([]byte{0x01, 0x00})
	} else {
		_, _ = c.Write([]byte{0x05, 0x00})
	}
	// Request: VER CMD RSV ATYP DST.ADDR DST.PORT
	if _, err := io.ReadFull(c, buf[:4]); err != nil {
		return
	}
	var host string
	switch buf[3] {
	case 0x01:
		ip := make([]byte, 4)
		if _, err := io.ReadFull(c, ip); err != nil {
			return
		}
		host = net.IP(ip).String()
	case 0x03:
		if _, err := io.ReadFull(c, buf[:1]); err != nil {
			return
		}
		name := make([]byte, buf[0])
		if _, err := io.ReadFull(c, name); err != nil {
			return
		}
		host = string(name)
	case 0x04:
		ip := make([]byte, 16)
		if _, err := io.ReadFull(c, ip); err != nil {
			return
		}
		host = net.IP(ip).String()
	default:
		return
	}
	if _, err := io.ReadFull(c, buf[:2]); err != nil {
		return
	}
	target := net.JoinHostPort(host, strconv.Itoa(int(binary.BigEndian.Uint16(buf[:2]))))
	s.mu.Lock()
	s.targets = append(s.targets, target)
	s.mu.Unlock()

	up, err := net.Dial("tcp", target)
	if err != nil {
		_, _ = c.Write([]byte{0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0})
		return
	}
	defer up.Close()
	_, _ = c.Write([]byte{0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0})
	go func() { _, _ = io.Copy(up, c) }()
	_, _ = io.Copy(c, up)
}

// pdcFixture starts a fake Foxglove API and a fake site query-server. The API
// returns a signed link pointing at the site.
func pdcFixture(t *testing.T) (apiURL string, apiHost string, siteHost string) {
	t.Helper()
	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[]`))
	}))
	t.Cleanup(site.Close)
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(grafanaQueryResponse{Link: site.URL + "/v1/grafana-plugin-query?token=x"})
	}))
	t.Cleanup(api.Close)
	return api.URL, api.Listener.Addr().String(), site.Listener.Addr().String()
}

// grafanaProxyCfg is the plugin config Grafana sends when the instance has
// the secure socks proxy (PDC) configured.
func grafanaProxyCfg(proxyAddr string) map[string]string {
	return map[string]string{
		proxy.PluginSecureSocksProxyEnabled:       "true",
		proxy.PluginSecureSocksProxyProxyAddress:  proxyAddr,
		proxy.PluginSecureSocksProxyAllowInsecure: "true",
	}
}

func runPDCQuery(t *testing.T, ctx context.Context, jsonData map[string]any) error {
	t.Helper()
	raw, err := json.Marshal(jsonData)
	if err != nil {
		t.Fatal(err)
	}
	settings := backend.DataSourceInstanceSettings{
		UID:                     "ds-uid-123",
		Name:                    "Foxglove",
		Type:                    "foxglovedev-foxglove-datasource",
		JSONData:                raw,
		DecryptedSecureJSONData: map[string]string{"apiKey": "k"},
	}
	inst, err := NewDatasource(ctx, settings)
	if err != nil {
		return fmt.Errorf("NewDatasource: %w", err)
	}
	ds := inst.(*Datasource)
	defer ds.Dispose()
	q, _ := json.Marshal(map[string]any{"selection": map[string]any{"type": "messagePath", "messagePath": "/x"}})
	resp, err := ds.QueryData(ctx, &backend.QueryDataRequest{
		PluginContext: backend.PluginContext{DataSourceInstanceSettings: &settings},
		Queries:       []backend.DataQuery{{RefID: "A", JSON: q}},
	})
	if err != nil {
		return err
	}
	if e := resp.Responses["A"].Error; e != nil {
		return e
	}
	return nil
}

// With PDC configured in Grafana and enableSecureSocksProxy set in jsonData
// (as the Grafana API or provisioning would set it), both the Foxglove API
// call and the signed-link call go through the SOCKS proxy.
func TestPDC_EnabledOnDataSource_ProxiesBothHops(t *testing.T) {
	socks := newSocksRecorder(t)
	apiURL, apiHost, siteHost := pdcFixture(t)
	ctx := backend.WithGrafanaConfig(context.Background(), backend.NewGrafanaCfg(grafanaProxyCfg(socks.ln.Addr().String())))

	err := runPDCQuery(t, ctx, map[string]any{
		"baseUrl": apiURL, "projectId": "p", "siteId": "s",
		"enableSecureSocksProxy": true,
	})
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	got := socks.Targets()
	if len(got) != 2 || got[0] != apiHost || got[1] != siteHost {
		t.Fatalf("socks targets = %v, want [%s %s]", got, apiHost, siteHost)
	}
	if socks.username != "ds-uid-123" {
		t.Fatalf("socks username = %q, want data source UID", socks.username)
	}
}

// Without enableSecureSocksProxy on the data source, no traffic uses PDC.
func TestPDC_NotEnabledOnDataSource_Direct(t *testing.T) {
	socks := newSocksRecorder(t)
	apiURL, _, _ := pdcFixture(t)
	ctx := backend.WithGrafanaConfig(context.Background(), backend.NewGrafanaCfg(grafanaProxyCfg(socks.ln.Addr().String())))

	if err := runPDCQuery(t, ctx, map[string]any{"baseUrl": apiURL, "projectId": "p", "siteId": "s"}); err != nil {
		t.Fatalf("query: %v", err)
	}
	if got := socks.Targets(); len(got) != 0 {
		t.Fatalf("expected no socks traffic, got %v", got)
	}
}

// If the Grafana instance has no PDC configured, the jsonData flag is ignored.
func TestPDC_GrafanaProxyDisabled_Direct(t *testing.T) {
	apiURL, _, _ := pdcFixture(t)
	ctx := backend.WithGrafanaConfig(context.Background(), backend.NewGrafanaCfg(map[string]string{}))
	if err := runPDCQuery(t, ctx, map[string]any{
		"baseUrl": apiURL, "projectId": "p", "siteId": "s",
		"enableSecureSocksProxy": true,
	}); err != nil {
		t.Fatalf("query: %v", err)
	}
}
