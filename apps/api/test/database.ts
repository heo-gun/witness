const DEFAULT_TEST_DATABASE_URL = "mysql://root:tlog-dev@127.0.0.1:3307/tlog_test";

export function getTestDatabaseUrl(
  value: string = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid MySQL URL");
  }

  if (
    url.protocol !== "mysql:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/tlog_test" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("TEST_DATABASE_URL must target local tlog_test without query or fragment");
  }

  return url.href;
}
