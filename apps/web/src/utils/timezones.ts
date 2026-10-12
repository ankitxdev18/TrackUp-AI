/**
 * Curated list of common IANA timezones grouped by geographic region.
 */
export interface TimezoneOption {
  value: string;
  label: string;
  group: string;
}

const COMMON_TIMEZONES: { value: string; group: string }[] = [
  // UTC
  { value: "UTC", group: "UTC & Standard" },
  
  // North America
  { value: "America/New_York", group: "North America" },
  { value: "America/Chicago", group: "North America" },
  { value: "America/Denver", group: "North America" },
  { value: "America/Los_Angeles", group: "North America" },
  { value: "America/Anchorage", group: "North America" },
  { value: "America/Honolulu", group: "North America" },
  { value: "America/Phoenix", group: "North America" },
  { value: "America/Toronto", group: "North America" },
  { value: "America/Vancouver", group: "North America" },
  { value: "America/Mexico_City", group: "North America" },

  // South America
  { value: "America/Sao_Paulo", group: "South America" },
  { value: "America/Buenos_Aires", group: "South America" },
  { value: "America/Bogota", group: "South America" },
  { value: "America/Santiago", group: "South America" },
  { value: "America/Lima", group: "South America" },

  // Europe
  { value: "Europe/London", group: "Europe" },
  { value: "Europe/Dublin", group: "Europe" },
  { value: "Europe/Paris", group: "Europe" },
  { value: "Europe/Berlin", group: "Europe" },
  { value: "Europe/Amsterdam", group: "Europe" },
  { value: "Europe/Rome", group: "Europe" },
  { value: "Europe/Madrid", group: "Europe" },
  { value: "Europe/Stockholm", group: "Europe" },
  { value: "Europe/Warsaw", group: "Europe" },
  { value: "Europe/Kyiv", group: "Europe" },
  { value: "Europe/Bucharest", group: "Europe" },
  { value: "Europe/Athens", group: "Europe" },
  { value: "Europe/Istanbul", group: "Europe" },
  { value: "Europe/Moscow", group: "Europe" },

  // Asia
  { value: "Asia/Dubai", group: "Asia" },
  { value: "Asia/Kolkata", group: "Asia" },
  { value: "Asia/Bangkok", group: "Asia" },
  { value: "Asia/Singapore", group: "Asia" },
  { value: "Asia/Hong_Kong", group: "Asia" },
  { value: "Asia/Shanghai", group: "Asia" },
  { value: "Asia/Tokyo", group: "Asia" },
  { value: "Asia/Seoul", group: "Asia" },
  { value: "Asia/Jakarta", group: "Asia" },
  { value: "Asia/Manila", group: "Asia" },

  // Australia & Pacific
  { value: "Australia/Sydney", group: "Australia & Pacific" },
  { value: "Australia/Melbourne", group: "Australia & Pacific" },
  { value: "Australia/Brisbane", group: "Australia & Pacific" },
  { value: "Australia/Perth", group: "Australia & Pacific" },
  { value: "Pacific/Auckland", group: "Australia & Pacific" },
  { value: "Pacific/Fiji", group: "Australia & Pacific" },
  { value: "Pacific/Honolulu", group: "Australia & Pacific" },

  // Africa
  { value: "Africa/Cairo", group: "Africa" },
  { value: "Africa/Johannesburg", group: "Africa" },
  { value: "Africa/Lagos", group: "Africa" },
  { value: "Africa/Nairobi", group: "Africa" },
  { value: "Africa/Casablanca", group: "Africa" },
];

/**
 * Returns formatted timezone options with friendly display labels.
 */
export function getTimezoneOptions(): TimezoneOption[] {
  // Check if browser supports Intl.supportedValuesOf
  let allZones: { value: string; group: string }[] = [...COMMON_TIMEZONES];

  if (typeof Intl !== "undefined" && typeof (Intl as any).supportedValuesOf === "function") {
    try {
      const systemZones: string[] = (Intl as any).supportedValuesOf("timeZone");
      const existingSet = new Set(COMMON_TIMEZONES.map((z) => z.value));
      for (const zone of systemZones) {
        if (!existingSet.has(zone)) {
          const slashIdx = zone.indexOf("/");
          const group = slashIdx > 0 ? zone.substring(0, slashIdx).replace(/_/g, " ") : "Other";
          allZones.push({ value: zone, group });
        }
      }
    } catch {
      // Fallback to COMMON_TIMEZONES
    }
  }

  return allZones.map((z) => {
    return {
      value: z.value,
      label: z.value.replace(/_/g, " "),
      group: z.group,
    };
  });
}

/**
 * Returns the browser's currently detected local timezone identifier.
 */
export function getLocalDetectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Returns a human-friendly current time formatted in the specified timezone.
 */
export function formatCurrentTimeInZone(timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    return formatter.format(new Date());
  } catch {
    return "Unknown";
  }
}
