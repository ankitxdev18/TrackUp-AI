import type { CalendarEvent } from "../../api/calendar";
import type { PositionedTimedEvent } from "./calendar.types";
import { getDurationMinutes, getMinutesFromDayStart } from "./calendarDateUtils";

interface InternalEventTiming {
  event: CalendarEvent;
  topMinutes: number;
  durationMinutes: number;
  bottomMinutes: number;
}

/**
 * Computes deterministic horizontal column layout for overlapping timed events.
 *
 * Algorithm:
 * 1. Calculate topMinutes and durationMinutes in the active calendar timezone.
 * 2. Group intersecting intervals into overlap clusters.
 * 3. Greedily assign non-conflicting column indices within each cluster.
 * 4. Compute leftPercent and widthPercent proportional to maximum concurrent columns.
 */
export function calculateTimedEventPositions(
  events: CalendarEvent[],
  timeZone: string
): PositionedTimedEvent[] {
  // Only timed events can be positioned on the vertical time axis
  const timed = events.filter((e): e is CalendarEvent & { isAllDay: false; startTime: string; endTime: string } => {
    return !e.isAllDay && Boolean(e.startTime) && Boolean(e.endTime);
  });

  if (timed.length === 0) {
    return [];
  }

  // 1. Calculate continuous day minute intervals [topMinutes, bottomMinutes)
  const timings: InternalEventTiming[] = timed.map((event) => {
    const top = getMinutesFromDayStart(event.startTime, timeZone);
    const duration = getDurationMinutes(event.startTime, event.endTime);
    // Clamp to 24h day boundary (0 to 1440)
    const clampedTop = Math.max(0, Math.min(1430, top));
    const clampedDuration = Math.max(15, Math.min(1440 - clampedTop, duration));

    return {
      event,
      topMinutes: clampedTop,
      durationMinutes: clampedDuration,
      bottomMinutes: clampedTop + clampedDuration,
    };
  });

  // 2. Sort by topMinutes ASC, bottomMinutes DESC, and stable ID
  timings.sort((a, b) => {
    if (a.topMinutes !== b.topMinutes) return a.topMinutes - b.topMinutes;
    if (a.bottomMinutes !== b.bottomMinutes) return b.bottomMinutes - a.bottomMinutes;
    return a.event.id.localeCompare(b.event.id);
  });

  // 3. Cluster overlapping intervals
  const clusters: InternalEventTiming[][] = [];
  let currentCluster: InternalEventTiming[] = [];
  let currentClusterEnd = -1;

  for (const item of timings) {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      currentClusterEnd = item.bottomMinutes;
    } else if (item.topMinutes < currentClusterEnd) {
      // Overlaps with current cluster
      currentCluster.push(item);
      currentClusterEnd = Math.max(currentClusterEnd, item.bottomMinutes);
    } else {
      // New cluster
      clusters.push(currentCluster);
      currentCluster = [item];
      currentClusterEnd = item.bottomMinutes;
    }
  }

  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // 4. Assign columns and calculate CSS percentage geometry
  const positioned: PositionedTimedEvent[] = [];

  for (const cluster of clusters) {
    const columnEnds: number[] = [];
    const clusterAssignments: { item: InternalEventTiming; col: number }[] = [];

    for (const item of cluster) {
      let placed = false;
      for (let col = 0; col < columnEnds.length; col++) {
        if (columnEnds[col] <= item.topMinutes) {
          columnEnds[col] = item.bottomMinutes;
          clusterAssignments.push({ item, col });
          placed = true;
          break;
        }
      }

      if (!placed) {
        const newCol = columnEnds.length;
        columnEnds.push(item.bottomMinutes);
        clusterAssignments.push({ item, col: newCol });
      }
    }

    const totalColumns = Math.max(1, columnEnds.length);
    const widthPercent = 100 / totalColumns;

    for (const { item, col } of clusterAssignments) {
      positioned.push({
        event: item.event,
        topMinutes: item.topMinutes,
        durationMinutes: item.durationMinutes,
        column: col,
        totalColumns,
        leftPercent: col * widthPercent,
        widthPercent,
      });
    }
  }

  return positioned;
}
