import type {
  CrosswalkReservationView,
  CrosswalkSlotView,
  JunctionSnapshot,
  LaneSlotView,
  VehicleType,
} from "../core/types.js";
import {
  resolveVehicleOccupancy,
  riskTagFor,
  vehicleClass,
} from "../core/vehicleRoster.js";

export const EMPTY_CELL = ".";
export const UNROUTED_CELL = " ";
export const LOCKED_CELL = "#";
export const PEDESTRIAN_CELL = "*";

/** Uppercase letter for a vehicle type; the body of the vehicle uses the lowercase form. */
export function vehicleLetter(type: VehicleType): string {
  if (type === "MOTORCYCLE") {
    return "M";
  }
  const tag = riskTagFor(type);
  if (tag === "SCHOOL_BUS") {
    return "S";
  }
  if (tag === "HAZMAT") {
    return "H";
  }
  switch (vehicleClass(type)) {
    case "emergency":
      return "E";
    case "bus":
      return "B";
    case "van":
      return "V";
    case "truck":
      return resolveVehicleOccupancy(type).lengthSlots >= 4 ? "K" : "L";
    default:
      return /taxi/i.test(type) ? "T" : "P";
  }
}

function trimEmpty(cells: string[]): string {
  let end = cells.length;
  while (end > 0 && cells[end - 1] === EMPTY_CELL) {
    end -= 1;
  }
  return cells.slice(0, end).join("");
}

/**
 * One character per slot, index 0 at the junction side of the lane.
 * Inbound bodies trail away from the junction, outbound bodies trail back toward it.
 */
export function encodeLane(view: LaneSlotView, bodyDirection: 1 | -1): string {
  const cells = Array.from({ length: view.capacitySlots }, () => EMPTY_CELL);
  for (const vehicle of view.vehicles) {
    const letter = vehicleLetter(vehicle.type);
    for (let body = 0; body < vehicle.lengthSlots; body += 1) {
      const index = vehicle.headIndex + body * bodyDirection;
      if (index < 0 || index >= cells.length) {
        continue;
      }
      cells[index] = body === 0 ? letter : letter.toLowerCase();
    }
  }
  return trimEmpty(cells);
}

export function encodeCrosswalk(view: CrosswalkSlotView): [string, string] {
  const rows = [0, 1].map(() => Array.from({ length: view.columns }, () => EMPTY_CELL));
  for (const cell of view.cells) {
    const row = rows[cell.row];
    if (row !== undefined && cell.column >= 0 && cell.column < row.length) {
      row[cell.column] = cell.mark;
    }
  }
  return [rows[0]!.join(""), rows[1]!.join("")];
}

/** Same 2-row layout as `encodeCrosswalk`; digit = ticks until a vehicle first holds the cell. */
export function encodeCrosswalkReservations(view: CrosswalkReservationView): [string, string] {
  const rows = [0, 1].map(() => Array.from({ length: view.columns }, () => EMPTY_CELL));
  for (const cell of view.cells) {
    const row = rows[cell.row];
    if (row !== undefined && cell.column >= 0 && cell.column < row.length) {
      row[cell.column] = String(Math.min(9, cell.tickOffset));
    }
  }
  return [rows[0]!.join(""), rows[1]!.join("")];
}

function emptyGrid(snapshot: JunctionSnapshot): string[][] {
  const size = snapshot.maxCoordinate - snapshot.minCoordinate + 1;
  const grid = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => UNROUTED_CELL),
  );
  for (const point of snapshot.routedCells) {
    setCell(grid, snapshot, point.x, point.y, EMPTY_CELL);
  }
  return grid;
}

function setCell(
  grid: string[][],
  snapshot: JunctionSnapshot,
  x: number,
  y: number,
  value: string,
): void {
  const row = grid[y - snapshot.minCoordinate];
  const column = x - snapshot.minCoordinate;
  if (row !== undefined && column >= 0 && column < row.length) {
    row[column] = value;
  }
}

/** Row 0 is the northernmost row (smallest y), column 0 the westernmost (smallest x). */
export function encodeJunctionOccupancy(snapshot: JunctionSnapshot): string[] {
  const grid = emptyGrid(snapshot);
  for (const point of snapshot.lockedCells) {
    setCell(grid, snapshot, point.x, point.y, LOCKED_CELL);
  }
  for (const point of snapshot.pedestrianCells) {
    setCell(grid, snapshot, point.x, point.y, PEDESTRIAN_CELL);
  }
  const heads = snapshot.vehicleCells.filter((cell) => cell.head);
  const bodies = snapshot.vehicleCells.filter((cell) => !cell.head);
  for (const cell of [...bodies, ...heads]) {
    const letter = vehicleLetter(cell.type);
    setCell(grid, snapshot, cell.x, cell.y, cell.head ? letter : letter.toLowerCase());
  }
  return grid.map((row) => row.join("").replace(/\s+$/, ""));
}

/** Digit = ticks from now until the cell's earliest reservation inside the horizon. */
export function encodeJunctionReservations(snapshot: JunctionSnapshot): string[] {
  const grid = emptyGrid(snapshot);
  for (const cell of snapshot.reservedCells) {
    setCell(grid, snapshot, cell.x, cell.y, String(Math.min(9, cell.tickOffset)));
  }
  return grid.map((row) => row.join("").replace(/\s+$/, ""));
}

/** Same coordinates as the occupancy grid; each row stops at its last locked cell. */
export function encodeLockGrid(snapshot: JunctionSnapshot): string[] {
  const grid = emptyGrid(snapshot);
  for (const point of snapshot.lockedCells) {
    setCell(grid, snapshot, point.x, point.y, LOCKED_CELL);
  }
  return grid.map((row) => {
    const text = row.join("");
    return text.slice(0, text.lastIndexOf(LOCKED_CELL) + 1);
  });
}
