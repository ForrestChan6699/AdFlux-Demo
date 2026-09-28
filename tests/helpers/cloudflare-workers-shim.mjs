// Node module-loader hook that resolves `cloudflare:workers` to a shim so the
// built Worker bundle can be imported and exercised inside node:test.
// The shim's `env` export is a Proxy that reads bindings from
// `globalThis.__ADFLUX_TEST_BINDINGS__` at access time, which lets each test
// file attach an in-memory D1 database before calling the Worker's fetch.

const shimSource = `
export const env = new Proxy({}, {
  get(_target, prop) {
    const bindings = globalThis.__ADFLUX_TEST_BINDINGS__;
    return bindings ? bindings[prop] : undefined;
  },
});
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      url: `data:text/javascript;base64,${Buffer.from(shimSource, "utf8").toString("base64")}`,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
