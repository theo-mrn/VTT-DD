/**
 * Utility functions for splitting walls when dropping doors/one-way walls
 */
import type { Point, Obstacle } from './visibility';

export const DEFAULT_FEATURE_WIDTH = 100; // px in image coordinates
const MIN_SEGMENT_LENGTH = 5; // px minimum to create a residual segment
const MERGE_SNAP_DISTANCE = 3; // px max distance to consider two endpoints as connected

/**
 * Project a point onto a line segment [p1, p2].
 * Returns the projected point, the perpendicular distance, and parameter t (0..1).
 */
export function projectPointOnSegment(
  point: Point,
  p1: Point,
  p2: Point
): { projected: Point; distance: number; t: number } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Degenerate segment (p1 === p2)
    const dist = Math.sqrt((point.x - p1.x) ** 2 + (point.y - p1.y) ** 2);
    return { projected: { ...p1 }, distance: dist, t: 0 };
  }

  // Parameter t of the projection along p1->p2
  let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t)); // Clamp to segment

  const projected: Point = {
    x: p1.x + t * dx,
    y: p1.y + t * dy,
  };

  const distance = Math.sqrt(
    (point.x - projected.x) ** 2 + (point.y - projected.y) ** 2
  );

  return { projected, distance, t };
}

/**
 * Find the nearest wall segment to a given point among all obstacles.
 * Only considers wall-like segments (not open doors).
 * Returns the obstacle, segment index, projected point, and distance.
 */
export function findNearestWallSegment(
  point: Point,
  obstacles: Obstacle[],
  maxDistance: number
): {
  obstacle: Obstacle;
  segmentIndex: number;
  projected: Point;
  distance: number;
} | null {
  let best: {
    obstacle: Obstacle;
    segmentIndex: number;
    projected: Point;
    distance: number;
  } | null = null;

  for (const obstacle of obstacles) {
    if (obstacle.type === 'wall' || obstacle.type === 'one-way-wall' || obstacle.type === 'door' || obstacle.type === 'window') {
      // Standalone 2-point obstacle => single segment (index 0)
      if (obstacle.points.length >= 2) {
        // Skip open doors
        if (obstacle.type === 'door' && obstacle.isOpen) continue;

        const { projected, distance } = projectPointOnSegment(
          point,
          obstacle.points[0],
          obstacle.points[1]
        );
        if (distance <= maxDistance && (!best || distance < best.distance)) {
          best = { obstacle, segmentIndex: 0, projected, distance };
        }
      }
    }
  }

  return best;
}

/**
 * Calculate the split points C1 and C2 to insert a feature of given width
 * centered on the projected point along the segment [p1, p2].
 */
export function calculateSplitPoints(
  p1: Point,
  p2: Point,
  projected: Point,
  featureWidth: number = DEFAULT_FEATURE_WIDTH
): { c1: Point; c2: Point; skipBefore: boolean; skipAfter: boolean } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const segLen = Math.sqrt(dx * dx + dy * dy);

  if (segLen === 0) {
    return { c1: { ...p1 }, c2: { ...p2 }, skipBefore: true, skipAfter: true };
  }

  // Unit direction vector along the segment
  const ux = dx / segLen;
  const uy = dy / segLen;

  // Distance from p1 to the projected point
  const projDist = Math.sqrt(
    (projected.x - p1.x) ** 2 + (projected.y - p1.y) ** 2
  );

  // Half-width of the feature
  const halfWidth = featureWidth / 2;

  // Raw positions of C1 and C2 along the segment
  let c1Dist = projDist - halfWidth;
  let c2Dist = projDist + halfWidth;

  // Clamp to segment bounds
  c1Dist = Math.max(0, c1Dist);
  c2Dist = Math.min(segLen, c2Dist);

  const c1: Point = {
    x: p1.x + c1Dist * ux,
    y: p1.y + c1Dist * uy,
  };
  const c2: Point = {
    x: p1.x + c2Dist * ux,
    y: p1.y + c2Dist * uy,
  };

  // Should we skip creating the residual segments?
  const skipBefore = c1Dist < MIN_SEGMENT_LENGTH;
  const skipAfter = (segLen - c2Dist) < MIN_SEGMENT_LENGTH;

  return { c1, c2, skipBefore, skipAfter };
}

/**
 * Determine the blocking direction for a one-way wall based on the segment orientation.
 * Uses the perpendicular normal (rotated 90deg clockwise).
 */
export function determineOneWayDirection(
  p1: Point,
  p2: Point
): 'north' | 'south' | 'east' | 'west' {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  // Normal perpendicular (90deg clockwise): (dy, -dx)
  const nx = dy;
  const ny = -dx;

  if (Math.abs(nx) > Math.abs(ny)) {
    return nx > 0 ? 'east' : 'west';
  } else {
    return ny > 0 ? 'south' : 'north';
  }
}

function pointsMatch(a: Point, b: Point): boolean {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) < MERGE_SNAP_DISTANCE;
}

/**
 * Find all wall-type obstacles connected to a given obstacle via shared endpoints.
 * Walks the chain in both directions, handles both open chains and closed loops.
 * Returns the set of all connected obstacle IDs (including the starting one).
 */
export function findAllConnectedWalls(
  startId: string,
  obstacles: Obstacle[]
): string[] {
  const visited = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const currentId = queue.pop()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const current = obstacles.find(o => o.id === currentId);
    if (!current || current.points.length < 2) continue;

    const p1 = current.points[0];
    const p2 = current.points[current.points.length - 1];

    for (const obs of obstacles) {
      if (visited.has(obs.id)) continue;
      if (obs.points.length < 2) continue;
      // Only follow wall-type obstacles (wall, door, one-way-wall, window)
      if (obs.type !== 'wall' && obs.type !== 'door' && obs.type !== 'one-way-wall' && obs.type !== 'window') continue;

      const oP1 = obs.points[0];
      const oP2 = obs.points[obs.points.length - 1];

      // Check if any endpoint matches
      if (pointsMatch(p1, oP1) || pointsMatch(p1, oP2) ||
          pointsMatch(p2, oP1) || pointsMatch(p2, oP2)) {
        queue.push(obs.id);
      }
    }
  }

  return Array.from(visited);
}

/**
 * Detect closed loops formed by connected wall-type obstacles.
 * Returns virtual polygon data for each loop (points + edge obstacles).
 * Used by the shadow engine to treat closed rooms correctly.
 */
export function findClosedLoops(obstacles: Obstacle[]): {
  points: Point[];
  wallObstacles: Obstacle[]; // wallObstacles[i] = the wall from points[i] to points[(i+1) % n]
}[] {
  const wallObs = obstacles.filter(o =>
    (o.type === 'wall' || o.type === 'door' || o.type === 'one-way-wall' || o.type === 'window') &&
    o.points.length >= 2
  );

  if (wallObs.length < 3) return [];

  // 1. Build node graph: merge endpoints within snap distance
  const nodes: Point[] = [];
  const wallNodes: [number, number][] = []; // [nodeA, nodeB] for each wall

  for (const wall of wallObs) {
    const idxs: number[] = [];
    for (let pi = 0; pi < 2; pi++) {
      const p = wall.points[pi];
      let nodeIdx = -1;
      for (let ni = 0; ni < nodes.length; ni++) {
        if (pointsMatch(p, nodes[ni])) { nodeIdx = ni; break; }
      }
      if (nodeIdx === -1) { nodeIdx = nodes.length; nodes.push(p); }
      idxs.push(nodeIdx);
    }
    wallNodes.push([idxs[0], idxs[1]]);
  }

  // 2. Build adjacency: node -> [{wallIndex, otherNode}]
  const adj: { wi: number; other: number }[][] = Array.from({ length: nodes.length }, () => []);
  for (let wi = 0; wi < wallObs.length; wi++) {
    const [a, b] = wallNodes[wi];
    adj[a].push({ wi, other: b });
    adj[b].push({ wi, other: a });
  }

  // 3. For each wall, BFS to find the shortest cycle containing it
  const foundLoopKeys = new Set<string>();
  const loops: { points: Point[]; wallObstacles: Obstacle[] }[] = [];

  for (let startWi = 0; startWi < wallObs.length; startWi++) {
    const [nodeA, nodeB] = wallNodes[startWi];

    // BFS from nodeB to nodeA, without using wall startWi
    const parentNode = new Int32Array(nodes.length).fill(-1);
    const parentWall = new Int32Array(nodes.length).fill(-1);
    parentNode[nodeB] = nodeB; // mark as visited (self = root)
    const queue: number[] = [nodeB];
    let found = false;

    bfs: while (queue.length > 0) {
      const node = queue.shift()!;
      for (const { wi, other } of adj[node]) {
        if (wi === startWi) continue; // don't use the starting wall
        if (other === nodeA) {
          // Check min length: need at least 2 more walls (total >= 3)
          let pathLen = 1;
          let trace = node;
          while (trace !== nodeB) { pathLen++; trace = parentNode[trace]; }
          if (pathLen >= 2) {
            // Reconstruct: startWall + path from nodeB to node + this wall
            const pathWalls: number[] = [wi];
            let cur = node;
            while (cur !== nodeB) { pathWalls.push(parentWall[cur]); cur = parentNode[cur]; }
            pathWalls.reverse();

            const loopWallIndices = [startWi, ...pathWalls];
            const loopKey = loopWallIndices.slice().sort((a, b) => a - b).join(',');

            if (!foundLoopKeys.has(loopKey)) {
              foundLoopKeys.add(loopKey);

              // Build ordered points
              const loopWalls = loopWallIndices.map(i => wallObs[i]);
              const points: Point[] = [];
              const orderedWalls: Obstacle[] = [];
              let prevEnd = wallObs[startWi].points[0];

              for (const wall of loopWalls) {
                if (pointsMatch(wall.points[0], prevEnd)) {
                  points.push(wall.points[0]);
                  prevEnd = wall.points[1];
                } else {
                  points.push(wall.points[1]);
                  prevEnd = wall.points[0];
                }
                orderedWalls.push(wall);
              }
              loops.push({ points, wallObstacles: orderedWalls });
            }
            found = true;
            break bfs;
          }
        }
        if (parentNode[other] === -1) {
          parentNode[other] = node;
          parentWall[other] = wi;
          queue.push(other);
        }
      }
    }

    // Reset parentNode/parentWall for next iteration
    if (found || queue.length === 0) {
      parentNode.fill(-1);
      parentWall.fill(-1);
    }
  }

  return loops;
}

/**
 * Find standalone wall obstacles adjacent to a given obstacle (sharing endpoints).
 * Returns walls that connect at p1 (before) and p2 (after) of the target obstacle.
 */
export function findAdjacentWalls(
  targetId: string,
  targetPoints: Point[],
  obstacles: Obstacle[]
): { before: Obstacle | null; after: Obstacle | null } {
  if (targetPoints.length < 2) return { before: null, after: null };
  const p1 = targetPoints[0];
  const p2 = targetPoints[targetPoints.length - 1];

  let before: Obstacle | null = null;
  let after: Obstacle | null = null;

  for (const obs of obstacles) {
    if (obs.id === targetId) continue;
    if (obs.points.length < 2) continue;
    if (obs.type !== 'wall' && obs.type !== 'door' && obs.type !== 'one-way-wall' && obs.type !== 'window') continue;

    const obsP1 = obs.points[0];
    const obsP2 = obs.points[obs.points.length - 1];

    // Wall connects at target's start (p1)
    if (!before) {
      if (pointsMatch(obsP2, p1)) {
        before = obs; // obs.p2 -> target.p1: wall runs INTO the target start
      } else if (pointsMatch(obsP1, p1)) {
        // obs.p1 matches target.p1 => wall runs away, reverse it conceptually
        before = obs;
      }
    }

    // Wall connects at target's end (p2)
    if (!after) {
      if (pointsMatch(obsP1, p2)) {
        after = obs; // target.p2 -> obs.p1: wall runs FROM the target end
      } else if (pointsMatch(obsP2, p2)) {
        after = obs;
      }
    }

    if (before && after) break;
  }

  return { before, after };
}

/**
 * Compute the merged wall points from adjacent walls + the deleted obstacle.
 * Returns the two endpoints of the merged wall: [outerStart, outerEnd].
 */
export function getMergedWallPoints(
  target: Obstacle,
  before: Obstacle | null,
  after: Obstacle | null
): Point[] {
  const p1 = target.points[0];
  const p2 = target.points[target.points.length - 1];

  // Find the "outer" endpoint of the before wall (the end NOT touching target.p1)
  let start: Point = p1;
  if (before) {
    const bP1 = before.points[0];
    const bP2 = before.points[before.points.length - 1];
    start = pointsMatch(bP2, p1) ? bP1 : bP2;
  }

  // Find the "outer" endpoint of the after wall (the end NOT touching target.p2)
  let end: Point = p2;
  if (after) {
    const aP1 = after.points[0];
    const aP2 = after.points[after.points.length - 1];
    end = pointsMatch(aP1, p2) ? aP2 : aP1;
  }

  return [start, end];
}

/**
 * Test if two line segments (a1→a2) and (b1→b2) intersect.
 * Uses cross-product orientation test.
 */
export function segmentsIntersect(
  a1: Point, a2: Point,
  b1: Point, b2: Point
): boolean {
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  // Collinear / endpoint cases — check if point lies on segment
  const onSegment = (p: Point, q: Point, r: Point) =>
    Math.min(q.x, r.x) <= p.x && p.x <= Math.max(q.x, r.x) &&
    Math.min(q.y, r.y) <= p.y && p.y <= Math.max(q.y, r.y);

  if (d1 === 0 && onSegment(a1, b1, b2)) return true;
  if (d2 === 0 && onSegment(a2, b1, b2)) return true;
  if (d3 === 0 && onSegment(b1, a1, a2)) return true;
  if (d4 === 0 && onSegment(b2, a1, a2)) return true;

  return false;
}

/**
 * Check if a movement from→to is blocked by any obstacle.
 * Blocking obstacles: walls, closed doors, windows, one-way walls.
 * Open doors allow passage.
 */
export function isMovementBlocked(
  from: Point, to: Point,
  obstacles: Obstacle[]
): boolean {
  for (const obstacle of obstacles) {
    // Skip open doors
    if (obstacle.type === 'door' && obstacle.isOpen) continue;
    // Skip non-blocking types
    if (obstacle.type === 'polygon' || obstacle.type === 'rectangle') continue;

    if (obstacle.points.length >= 2) {
      const p1 = obstacle.points[0];
      const p2 = obstacle.points[1];
      if (segmentsIntersect(from, to, p1, p2)) {
        return true;
      }
    }
  }
  return false;
}
