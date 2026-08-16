import { describe, expect, it } from "vitest";
import { cleanSongQuery, normalizeLavaLyrics, parseLrc } from "./lyrics";

describe("lyrics helper", () => {
  describe("parseLrc", () => {
    it("parses valid LRC timestamped lines", () => {
      const lrc = `
[00:12.50] Hello from the other side
[00:15.00] I must have called a thousand times
[00:20.123] To tell you I'm sorry
      `;
      const parsed = parseLrc(lrc);
      expect(parsed).toHaveLength(3);
      expect(parsed[0]).toEqual({ timeMs: 12500, text: "Hello from the other side" });
      expect(parsed[1]).toEqual({ timeMs: 15000, text: "I must have called a thousand times" });
      expect(parsed[2]).toEqual({ timeMs: 20123, text: "To tell you I'm sorry" });
    });

    it("handles plain text fallback inside LRC", () => {
      const lrc = `
[00:05.00] Intro
Outro without tag
      `;
      const parsed = parseLrc(lrc);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]?.text).toBe("Intro");
      expect(parsed[1]?.text).toBe("Outro without tag");
    });
  });

  describe("cleanSongQuery", () => {
    it("cleans video suffixes and topic artist names", () => {
      const cleaned1 = cleanSongQuery("Feeling This (Official Music Video)", "Blink-182 - Topic");
      expect(cleaned1.cleanTitle).toBe("Feeling This");
      expect(cleaned1.cleanArtist).toBe("Blink-182");

      const cleaned2 = cleanSongQuery("In The End [Official HD Video]", "Linkin Park VEVO");
      expect(cleaned2.cleanTitle).toBe("In The End");
      expect(cleaned2.cleanArtist).toBe("Linkin Park");
    });

    it("splits 'Artist - Title' format when artist is missing", () => {
      const cleaned = cleanSongQuery("Avril Lavigne - Complicated");
      expect(cleaned.cleanArtist).toBe("Avril Lavigne");
      expect(cleaned.cleanTitle).toBe("Complicated");
    });
  });

  describe("normalizeLavaLyrics", () => {
    it("normalizes LavaLyrics timestamped JSON", () => {
      const normalized = normalizeLavaLyrics({
        name: "Feeling This",
        author: "Blink-182",
        sourceName: "youtube",
        synced: true,
        lines: [
          { timestamp: 1000, line: "I'm feeling this" },
          { timestamp: 4000, line: "Fate fell short this time" },
        ],
      });

      expect(normalized).not.toBeNull();
      expect(normalized?.trackTitle).toBe("Feeling This");
      expect(normalized?.artist).toBe("Blink-182");
      expect(normalized?.synced).toBe(true);
      expect(normalized?.lines).toHaveLength(2);
      expect(normalized?.lines[0]).toEqual({ timeMs: 1000, text: "I'm feeling this" });
    });
  });
});
