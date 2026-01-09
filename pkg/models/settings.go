package models

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type PluginSettings struct {
	// BaseURL prefers the new jsonData.baseUrl. Path is kept for backward compatibility.
	BaseURL string                `json:"baseUrl"`
	Path    string                `json:"path"`
	Secrets *SecretPluginSettings `json:"-"`
}

type SecretPluginSettings struct {
	ApiKey string `json:"apiKey"`
}

func LoadPluginSettings(source backend.DataSourceInstanceSettings) (*PluginSettings, error) {
	settings := PluginSettings{}
	err := json.Unmarshal(source.JSONData, &settings)
	if err != nil {
		return nil, fmt.Errorf("could not unmarshal PluginSettings json: %w", err)
	}

	settings.Secrets = loadSecretPluginSettings(source.DecryptedSecureJSONData)

	// Support provisioning via env-var placeholders (e.g. ${FOXGLOVE_API_KEY}) even if
	// Grafana doesn't expand them for some reason, and provide a safe fallback for CI.
	//
	// Note: this only applies when values are missing/empty or look like ${SOME_ENV_VAR}.
	settings.BaseURL = normalizeEnvPlaceholder(settings.BaseURL)
	settings.Path = normalizeEnvPlaceholder(settings.Path)
	if settings.Secrets != nil {
		settings.Secrets.ApiKey = normalizeEnvPlaceholder(settings.Secrets.ApiKey)
	}

	if strings.TrimSpace(settings.BaseURL) == "" {
		if v := strings.TrimSpace(os.Getenv("FOXGLOVE_API_BASE_URL")); v != "" {
			settings.BaseURL = v
		}
	}
	if settings.Secrets != nil && strings.TrimSpace(settings.Secrets.ApiKey) == "" {
		if v := strings.TrimSpace(os.Getenv("FOXGLOVE_API_KEY")); v != "" {
			settings.Secrets.ApiKey = v
		}
	}

	return &settings, nil
}

func normalizeEnvPlaceholder(s string) string {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return ""
	}
	// Common pattern used in Grafana provisioning files.
	if strings.HasPrefix(trimmed, "${") && strings.HasSuffix(trimmed, "}") {
		return ""
	}
	return s
}

func loadSecretPluginSettings(source map[string]string) *SecretPluginSettings {
	return &SecretPluginSettings{
		ApiKey: source["apiKey"],
	}
}
