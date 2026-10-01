import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { traceIsHot } from "./format-trace.js";
import { sidebarRows } from "./render-console.js";
import type { BenchFrame } from "./live-session.js";

const FRAME_WIDTH = 126;
const FRAME_HEIGHT = 35;
const MAP_WIDTH = 54;
const MAP_HEIGHT = 24;
const SIDEBAR_WIDTH = 70;
const LOG_ROWS = 4;

export function BenchLiveView({ frame }: { readonly frame: BenchFrame }) {
  const mapRows = frame.map.length === 0 ? [] : frame.map.split("\n");
  const rows = sidebarRows(frame);
  const logs = Array.from({ length: LOG_ROWS }, (_, index) => frame.logs[index] ?? "");
  return (
    <Box flexDirection="column" width={FRAME_WIDTH} height={FRAME_HEIGHT}>
      <Box width={FRAME_WIDTH} height={1}>
        <Box width={MAP_WIDTH}>
          <Text wrap="truncate">CROSSROAD  8-lane 4-way</Text>
        </Box>
        <Box width={2} />
        <Box width={SIDEBAR_WIDTH}>
          <Text wrap="truncate">COMMAND  radar / lanes / memory</Text>
        </Box>
      </Box>
      <Box width={FRAME_WIDTH} height={MAP_HEIGHT}>
        <Box width={MAP_WIDTH} height={MAP_HEIGHT} flexDirection="column" flexShrink={0}>
          {pad(mapRows, MAP_HEIGHT).map((row, index) => (
            <Text key={index} wrap="truncate">
              {row.length === 0 ? " " : row}
            </Text>
          ))}
        </Box>
        <Box width={2} />
        <Box width={SIDEBAR_WIDTH} height={MAP_HEIGHT} flexDirection="column" flexShrink={0}>
          {rows.map((row, index) =>
            row.kind === "phase" ? (
              <Text key={index} wrap="truncate">
                {row.thinking ? <Spinner type="dots" /> : " "}
                {row.thinking ? " 思考中" : " 推进中"}
              </Text>
            ) : (
              <Text key={index} wrap="truncate">
                {row.text}
              </Text>
            ),
          )}
        </Box>
      </Box>
      <Box width={FRAME_WIDTH} height={10} flexDirection="column">
        <Text wrap="truncate">AGENT TRACE</Text>
        {logs.map((line, index) =>
          traceIsHot(line) ? (
            <Text key={`${index}:${line}`} wrap="truncate" color="yellowBright">
              {line}
            </Text>
          ) : (
            <Text key={`${index}:${line}`} wrap="truncate" dimColor>
              {line.length === 0 ? " " : line}
            </Text>
          ),
        )}
        <Box flexGrow={1} />
      </Box>
    </Box>
  );
}

function pad(rows: readonly string[], height: number): string[] {
  const next = rows.slice(0, height);
  while (next.length < height) {
    next.push(" ");
  }
  return next;
}
