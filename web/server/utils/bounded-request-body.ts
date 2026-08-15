export async function readBoundedRequestBody(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of body) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw new Error("Request body too large.");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks, totalBytes);
}

export interface MultipartPart {
  name?: string;
  filename?: string;
  type?: string;
  data: Buffer;
}

export function parseMultipartFormData(
  body: Buffer,
  boundary: string,
): MultipartPart[] {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts: MultipartPart[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    const boundaryIndex = body.indexOf(delimiter, cursor);
    if (boundaryIndex < 0) break;
    cursor = boundaryIndex + delimiter.length;
    if (body[cursor] === 45 && body[cursor + 1] === 45) break;
    if (body[cursor] === 13 && body[cursor + 1] === 10) cursor += 2;

    const headerEnd = body.indexOf("\r\n\r\n", cursor, "utf8");
    if (headerEnd < 0) break;
    const headerLines = body.subarray(cursor, headerEnd).toString("utf8").split("\r\n");
    const headers = new Map<string, string>();
    for (const line of headerLines) {
      const separator = line.indexOf(":");
      if (separator > 0) {
        headers.set(line.slice(0, separator).toLowerCase(), line.slice(separator + 1).trim());
      }
    }

    const nextBoundary = body.indexOf(Buffer.from(`\r\n--${boundary}`), headerEnd + 4);
    if (nextBoundary < 0) break;
    const disposition = headers.get("content-disposition") || "";
    const name = /(?:^|;)\s*name="([^"]*)"/i.exec(disposition)?.[1];
    const filename = /(?:^|;)\s*filename="([^"]*)"/i.exec(disposition)?.[1];
    parts.push({
      name,
      filename,
      type: headers.get("content-type"),
      data: body.subarray(headerEnd + 4, nextBoundary),
    });
    cursor = nextBoundary + 2;
  }

  return parts;
}
