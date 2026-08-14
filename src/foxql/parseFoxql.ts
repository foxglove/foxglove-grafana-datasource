// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import { Grammar, Parser } from "nearley";

import grammar from "./grammar";
import { parseFunction } from "./parseFunction";
import type { FoxqlExpression, FoxqlFilter } from "./types";

const grammarObj = Grammar.fromCompiled(grammar);
/**
 * Names of functions that operate on structs and return structs (e.g., quaternion↔RPY conversion).
 * This is the single source of truth; other packages should import from here.
 */
export const STRUCT_FUNCTION_NAMES = new Set(["rpy", "quat"]);

const parseFoxql = (path: string): FoxqlExpression | undefined => {
  // Need to create a new Parser object for every new string to parse (should be cheap).
  const parser = new Parser(grammarObj);
  try {
    const result = parser.feed(path).results[0];
    if (result === undefined) {
      return result;
    }
    if (!isFunctionChainSemanticallyValid(result as FoxqlExpression)) {
      return undefined;
    }

    const isFullySpecified = isFoxqlFullySpecified(result as FoxqlExpression);

    return {
      ...result,
      stringified: path,
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
function isFunctionChainSemanticallyValid(expression: FoxqlExpression): boolean {
  if (expression.functionChain === undefined) {
    return true;
  }
  for (const step of expression.functionChain) {
    if (step.fieldAccess === undefined) {
      continue;
    }
    if (step.function.length === 0) {
      return false;
    }
    const functionName = parseFunction(step.function)?.name;
    if (functionName === undefined || !STRUCT_FUNCTION_NAMES.has(functionName)) {
      return false;
    }
  }
  return true;
}

function isFilterMissingOperatorOrValue(filter: FoxqlFilter): boolean {
  // Empty filters ({} or {foo} or {bar==}) intentionally omit operator/value for autocomplete
  return filter.operator === undefined || filter.value === undefined;
}

/**
 * The FoxQL grammar allows half-empty filters and names to support autocomplete.
 * This function checks if a parsed expression is fully specified and does not contain any
 * unfinished names or filters.
 *
 * @param parsed - The parsed FoxQL expression to check.
 * @returns True if the expression is fully specified, false otherwise.
 */
function isFoxqlFullySpecified(parsed: FoxqlExpression): boolean {
  for (const part of parsed.parts) {
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
  if (parsed.functionChain !== undefined) {
    for (const step of parsed.functionChain) {
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

export { parseFoxql };
