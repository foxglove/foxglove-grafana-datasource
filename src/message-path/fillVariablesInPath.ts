import type { Immutable, VariableStruct } from "./foxglove";

import { stringifyMessagePath } from "./stringifyMessagePath";
import type { MessagePath } from "./types";

type ParsedMessagePathFunction = { name: string; operand?: number; operandRaw?: string };
const FUNCTION_WITH_ARG_PATTERN = /^([a-zA-Z0-9_-]+)(?:\((.*)\))?$/;
/**
 * Parse a message path function string into a name and optional operand.
 * @param pathFunction - The message path function string to parse.
 * @returns The parsed function name and operand, or undefined if invalid.
 * A raw operand is included if the operand is not a number (likely a variable reference).
 */
export function parseFunction(pathFunction: string): ParsedMessagePathFunction | undefined {
  if (pathFunction.length === 0) {
    return undefined;
  }

  const match = FUNCTION_WITH_ARG_PATTERN.exec(pathFunction);
  if (!match) {
    return { name: pathFunction };
  }
  const name = match[1] ?? "";
  if (!name) {
    return undefined;
  }
  const raw = match[2];
  if (raw == undefined || raw.length === 0) {
    return { name };
  }
  const unquoted = raw.replace(/^["'](.*)["']$/s, "$1");
  const asNumber = Number(unquoted);
  return Number.isNaN(asNumber)
    ? { name, operandRaw: unquoted }
    : { name, operand: asNumber, operandRaw: unquoted };
}

export function fillVariablesInPath(
  messagePath: MessagePath,
  variables: Immutable<VariableStruct>,
): MessagePath {
  const filledMessagePath: Omit<MessagePath, "stringifiedMessagePath"> = {
    ...messagePath,
    messagePath: messagePath.messagePath.map((messagePathPart) => {
      if (messagePathPart.type === "slice") {
        const start =
          typeof messagePathPart.start === "object"
            ? Number(variables[messagePathPart.start.variableName])
            : messagePathPart.start;
        const end =
          typeof messagePathPart.end === "object"
            ? Number(variables[messagePathPart.end.variableName])
            : messagePathPart.end;

        return {
          ...messagePathPart,
          start: isNaN(start) ? 0 : start,
          end: isNaN(end) ? Infinity : end,
        };
      } else if (messagePathPart.type === "filter" && typeof messagePathPart.value === "object") {
        let value;
        const variable = variables[messagePathPart.value.variableName];
        if (typeof variable === "number" || typeof variable === "string") {
          value = variable;
        }
        const pathAndOp =
          messagePathPart.path.map((p) => p.repr).join(".") + (messagePathPart.operator ?? "");
        return {
          ...messagePathPart,
          value,
          valueLoc: messagePathPart.nameLoc + pathAndOp.length,
          repr: pathAndOp + (JSON.stringify(value) ?? "undefined"),
        };
      }

      return messagePathPart;
    }),
  };

  /**
   * Resolve a single-operand function argument of the form `$var`.
   * Returns the substituted argument string, or `undefined` when not resolvable.
   */
  const resolveSingleOperand = (arg: string): string | undefined => {
    if (!arg.startsWith("$")) {
      return undefined;
    }
    const varName = arg.slice(1);
    const value = variables[varName];
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "string") {
      // Preserve string semantics; numeric strings will be coerced by consumers later
      return JSON.stringify(value);
    }
    return undefined;
  };

  if (filledMessagePath.functionChain != undefined) {
    filledMessagePath.functionChain = filledMessagePath.functionChain.map((step) => {
      const parsed = parseFunction(step.function);
      if (parsed?.operandRaw != undefined) {
        const resolved = resolveSingleOperand(parsed.operandRaw.trim());
        if (resolved != undefined) {
          return { ...step, function: `${parsed.name}(${resolved})` };
        }
      }
      return step;
    });
  }

  return { ...filledMessagePath, stringifiedMessagePath: stringifyMessagePath(filledMessagePath) };
}
