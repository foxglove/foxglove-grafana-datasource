// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

export type PrimitiveType =
  | "bool"
  | "int8"
  | "uint8"
  | "int16"
  | "uint16"
  | "int32"
  | "uint32"
  | "int64"
  | "uint64"
  | "float32"
  | "float64"
  | "string";

export type MessagePathOperator = "==" | "!=" | "<" | "<=" | ">" | ">=";

export type MessagePathNamePart = {
  type: "name";
  /** Referenced field name */
  name: string;
  /**
   * Original spelling of the field name in the input message path (for accurate reproduction in
   * autocomplete and string length)
   */
  repr: string;
};

export type MessagePathSliceIndex = number | { variableName: string; startLoc: number };

export type MessagePathSlicePart = {
  type: "slice";
  start: MessagePathSliceIndex;
  end: MessagePathSliceIndex;
};

export type MessagePathFilter = {
  type: "filter";
  operator?: MessagePathOperator;
  path: MessagePathNamePart[];
  value?: number | string | bigint | boolean | { variableName: string; startLoc: number };
  /** True when the filter value is a bare identifier (e.g., `ENUM_NAME` or `true`/`false`). */
  valueIsIdentifier?: boolean;
  nameLoc: number;
  valueLoc: number;
  repr: string; // the original string representation of the filter
};

// A parsed version of paths.
export type MessagePathPart = MessagePathNamePart | MessagePathSlicePart | MessagePathFilter;

export type MessagePathFunction = {
  /** Message path function to apply (e.g., "rpy", "degrees", "derivative") */
  function: string;
  /** Optional field access after a struct-returning function, e.g. `roll` in `.@rpy.roll` */
  fieldAccess?: string;
};

export type MessagePath = {
  /** Referenced topic name */
  topicName: string;
  /**
   * Original spelling of the topic name in the input message path (for accurate reproduction in
   * autocomplete and string length)
   */
  topicNameRepr: string;
  messagePath: MessagePathPart[];

  /**
   * Message path functions to run on output values of the path, evaluated left-to-right.
   * Example: `.@rpy.roll.@degrees` contains two steps.
   */
  functionChain?: MessagePathFunction[];
  /**
   * Stringified message path value. Usually set from the original message path string that
   * created the MessagePath.
   * Should be updated if the message path is modified.
   * Should be able to be used to check equality of message paths.
   */
  stringifiedMessagePath: string;

  /**
   * Indicates if the message path is fully specified or if it contains unresolved
   * names or filters. The grammar allows half-empty filter and names to support
   * autocomplete.
   *
   * True if the path is complete and valid, false if it is incomplete.
   */
  isFullySpecified: boolean;
};

// "Structure items" are a more useful version of `datatypes`. They can be
// easily traversed to either validate message paths or generate message paths.
export type MessagePathStructureItemMessage = {
  structureType: "message";
  nextByName: {
    [key: string]: MessagePathStructureItem;
  };
  datatype: string;
  deprecated?: boolean;
};
type MessagePathStructureItemArray = {
  structureType: "array";
  next: MessagePathStructureItem;
  datatype: string;
  deprecated?: boolean;
};
type MessagePathStructureItemPrimitive = {
  structureType: "primitive";
  primitiveType: PrimitiveType;
  datatype: string;
  deprecated?: boolean;
};
export type MessagePathStructureItem =
  | MessagePathStructureItemMessage
  | MessagePathStructureItemArray
  | MessagePathStructureItemPrimitive;
