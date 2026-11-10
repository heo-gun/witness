import { getTestDatabaseUrl } from "./database.js";

describe("Test database isolation", () => {
  it("sets the application database to the validated test database", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(process.env.DATABASE_URL).toBe(getTestDatabaseUrl());
    expect(new URL(process.env.DATABASE_URL ?? "").pathname).toBe("/tlog_test");
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])("accepts local host %s", (host) => {
    const value = `mysql://root:password@${host}:3307/tlog_test`;
    expect(getTestDatabaseUrl(value)).toBe(value);
  });

  it.each([
    "mysql://root:password@127.0.0.1:3307/tlog",
    "mysql://root:password@127.0.0.1:3307/tlog_test_extra",
    "mysql://root:password@remote.example:3306/tlog_test",
    "postgresql://root:password@localhost:5432/tlog_test",
    "mysql://root:password@localhost:3307/tlog_test?database=tlog",
    "mysql://root:password@localhost:3307/tlog_test#tlog",
    "mysql://root:password@localhost:3307/%74log_test",
    "",
    "not-a-url",
  ])("rejects an unsafe or invalid target (%#)", (value) => {
    expect(() => getTestDatabaseUrl(value)).toThrow(/TEST_DATABASE_URL/);
  });
});
