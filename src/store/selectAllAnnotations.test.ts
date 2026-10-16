// @vitest-environment jsdom
import { describe, expect, test, beforeEach } from "vitest";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { emptyMolecule } from "../model/molecule";
import type { Annotation } from "../types/chemistry";

/**
 * Regression tests for Ctrl/Cmd+A ("select all") leaving annotations out.
 *
 * A reaction scheme is mostly not atoms — it's arrows, brackets and
 * "H2O, heat" condition boxes. selectAll() selected atoms only, so the one
 * command that means "take the whole drawing" quietly dropped everything
 * else, and every operation built on the selection (copy to the clipboard,
 * rotate, duplicate, Delete) took the molecule and left the scheme around
 * it behind. Worst of all it failed silently: the paste into Word came out
 * looking complete enough that the missing text read as a clipboard bug
 * rather than a selection one.
 */

const textAnnotation: Annotation = {
  id: "ann-1",
  kind: "text",
  x: 10,
  y: 20,
  width: 160,
  height: 26,
  html: "H2O, heat",
  fontSize: 14,
};

const arrowAnnotation: Annotation = {
  id: "ann-2",
  kind: "arrow",
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 0,
  variant: "forward",
  barb: "full",
  headSize: "medium",
};

function freshStore(annotations: Record<string, Annotation> = {}) {
  useMoleculeStore.setState({
    molecule: emptyMolecule(),
    annotations,
    selected: new Set<string>(),
    selectedAnnotationIds: new Set<string>(),
  });
}

describe("selectAll", () => {
  beforeEach(() => {
    freshStore();
  });

  test("selects every annotation, not just atoms", () => {
    useMoleculeStore.setState({
      annotations: { [textAnnotation.id]: textAnnotation, [arrowAnnotation.id]: arrowAnnotation },
    });

    useMoleculeStore.getState().selectAll();

    const { selectedAnnotationIds } = useMoleculeStore.getState();
    expect([...selectedAnnotationIds].sort()).toEqual([arrowAnnotation.id, textAnnotation.id].sort());
  });

  test("leaves an empty annotation set empty rather than inventing one", () => {
    useMoleculeStore.getState().selectAll();
    expect(useMoleculeStore.getState().selectedAnnotationIds.size).toBe(0);
  });

  test("replaces a partial selection instead of adding to it", () => {
    useMoleculeStore.setState({
      annotations: { [textAnnotation.id]: textAnnotation, [arrowAnnotation.id]: arrowAnnotation },
      selectedAnnotationIds: new Set([textAnnotation.id]),
    });

    useMoleculeStore.getState().selectAll();

    expect(useMoleculeStore.getState().selectedAnnotationIds.size).toBe(2);
  });
});
