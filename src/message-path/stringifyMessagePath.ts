import type { Immutable } from "./foxglove";

import type {
  MessagePathFilter,
  MessagePathPart,
  MessagePath,
  MessagePathSliceIndex,
} from "./types";

/**
 * Return the string representation of the ros path
 */
export function stringifyMessagePath(
  path: Immutable<Omit<MessagePath, "stringifiedMessagePath">>,
): string {
  return (
    path.topicNameRepr +
    path.messagePath.map(stringifyMessagePathPart).join("") +
    (path.functionChain
      ? path.functionChain
          .map(
            (step) =>
              `.@${step.function}` + (step.fieldAccess != undefined ? `.${step.fieldAccess}` : ""),
          )
          .join("")
      : "")
  );
}

function stringifyMessagePathPart(part: Immutable<MessagePathPart>): string {
  switch (part.type) {
    case "name":
      return nameToString(part);
    case "filter":
      return filterToString(part);
    case "slice":
      return sliceToString(part);
  }
  return "";
}

export function nameToString(part: Immutable<MessagePathPart & { type: "name" }>): string {
  return `.${part.repr}`;
}

export function sliceToString(slice: Immutable<MessagePathPart & { type: "slice" }>): string {
  if (typeof slice.start === "number" && typeof slice.end === "number") {
    if (slice.start === slice.end) {
      return `[${slice.start}]`;
    }
    if (slice.start === 0) {
      return `[:${slice.end === Infinity ? "" : slice.end}]`;
    }
    return `[${slice.start === Infinity ? "" : slice.start}:${
      slice.end === Infinity ? "" : slice.end
    }]`;
  }

  const startStr = sliceIndexToString(slice.start);
  const endStr = sliceIndexToString(slice.end);
  if (startStr === endStr) {
    return `[${startStr}]`;
  }

  return `[${startStr}:${endStr}]`;
}

function sliceIndexToString(sliceIndex: Immutable<MessagePathSliceIndex>): string {
  if (typeof sliceIndex === "number") {
    if (sliceIndex === Infinity) {
      return "";
    }
    return String(sliceIndex);
  }

  return `$${sliceIndex.variableName}`;
}

export function filterToString(filter: Immutable<MessagePathFilter>): string {
  return `{${filter.repr}}`;
}
