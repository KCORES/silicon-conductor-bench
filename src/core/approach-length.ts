/**
 * Slots from the stop line out to the painted map edge.
 * Outside the intersection, one simulation cell is one world unit, and the
 * visual stop line sits `visualStopLine` units from the origin.
 */
export function approachLaneLength(
  mapEdge: number,
  visualStopLine: number,
): number {
  return Math.floor(mapEdge - visualStopLine) + 1;
}
