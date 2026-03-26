// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import { Grammar, Parser } from "nearley";

import { parseFunction } from "./fillVariablesInPath";
import grammar from "./grammar";
import type { MessagePath, MessagePathFilter } from "./types";

const grammarObj = Grammar.fromCompiled(grammar);
/**
 * Names of functions that operate on structs and return structs (e.g., quaternion↔RPY conversion).
 * This is the single source of truth; other packages should import from here.
 */
export const STRUCT_FUNCTION_NAMES = new Set(["rpy", "quat"]);

/** Wrap topic name in double quotes if it contains special characters */
export function quoteTopicNameIfNeeded(name: string): string {
  // Pattern should match `slashID` in grammar.ne
  if (name.match(/^[a-zA-Z0-9_/-]+$/)) {
    return name;
  }
  return `"${name.replace(/[\\"]/g, (char) => `\\${char}`)}"`;
}

/** Wrap field name in double quotes if it contains special characters */
export function quoteFieldNameIfNeeded(name: string): string {
  // Pattern should match `id` in grammar.ne
  if (name.match(/^[a-zA-Z0-9_-]+$/)) {
    return name;
  }
  return `"${name.replace(/[\\"]/g, (char) => `\\${char}`)}"`;
}

const parseMessagePath = (path: string): MessagePath | undefined => {
  // Need to create a new Parser object for every new string to parse (should be cheap).
  const parser = new Parser(grammarObj);
  try {
    const result = parser.feed(path).results[0];
    if (result == undefined) {
      return result;
    }
    if (!isFunctionChainSemanticallyValid(result as MessagePath)) {
      return undefined;
    }

    const isFullySpecified = isMessagePathFullySpecified(result as MessagePath);

    return {
      ...result,
      stringifiedMessagePath: path,
      isFullySpecified,
    };
  } catch (_err) {
    return undefined;
  }
};

/**
 * Validates structural constraints on the function chain (e.g. field access only after struct
 * functions). Ordering constraints (e.g. derivative/delta must be last) are enforced by
 * consumers like `isValidMathFunctionWithFieldAccess` in the Plot panel.
 */
function isFunctionChainSemanticallyValid(messagePath: MessagePath): boolean {
  if (messagePath.functionChain == undefined) {
    return true;
  }
  for (const step of messagePath.functionChain) {
    if (step.fieldAccess == undefined) {
      continue;
    }
    if (step.function.length === 0) {
      return false;
    }
    const functionName = parseFunction(step.function)?.name;
    if (functionName == undefined || !STRUCT_FUNCTION_NAMES.has(functionName)) {
      return false;
    }
  }
  return true;
}

function isFilterMissingOperatorOrValue(filter: MessagePathFilter): boolean {
  // Empty filters ({} or {foo} or {bar==}) intentionally omit operator/value for autocomplete
  return filter.operator == undefined || filter.value == undefined;
}

/**
 * The message path grammar allows half-empty filters and names to support autocomplete.
 * This function checks if a parsed message path is fully specified and does not contain any
 * unfinished names or filters.
 *
 * @param parsedMessagePath - The parsed message path to check.
 * @returns True if the message path is fully specified, false otherwise.
 */
function isMessagePathFullySpecified(parsedMessagePath: MessagePath): boolean {
  for (const part of parsedMessagePath.messagePath) {
    if (part.type === "name") {
      // Check for unfinished names (trailing dot)
      if (part.name === "") {
        return false;
      }
      continue;
    }

    if (part.type === "filter") {
      if (isFilterMissingOperatorOrValue(part)) {
        return false;
      }
      continue;
    }
    // slices are ignored for autocomplete validation here. These should be handled by the grammar.
  }
  if (parsedMessagePath.functionChain != undefined) {
    for (const step of parsedMessagePath.functionChain) {
      if (step.function === "") {
        return false;
      }
      if (step.fieldAccess === "") {
        return false;
      }
    }
  }
  return true;
}

export { parseMessagePath };
