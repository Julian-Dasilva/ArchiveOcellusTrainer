const request = globalThis.fetch;
let archive = null;

globalThis.fetch = async (...args) => {
  const response = await request(...args);
  const input = args[0];
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin === "https://archive.openrs2.org" && /^\/caches\/[^/]+\/\d+\/disk\.zip$/.test(url.pathname)) {
    const read = response.arrayBuffer.bind(response);
    response.arrayBuffer = async () => {
      const body = await read();
      archive = { url: url.href, bytes: body.byteLength };
      return body;
    };
  }
  return response;
};

process.once("exit", (code) => {
  if (code !== 0 && archive !== null) {
    console.error(`assets: failed after downloading OpenRS2 archive ${archive.url} (${archive.bytes} bytes)`);
  }
});
