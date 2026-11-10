import { Test } from "@nestjs/testing";
import { PasswordService } from "./password.service.js";

describe("PasswordService", () => {
  let service: PasswordService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ providers: [PasswordService] }).compile();
    service = moduleRef.get(PasswordService);
  });

  it("hashes with Argon2id and verifies the original password", async () => {
    const password = "12345678a!";
    const passwordHash = await service.hash(password);

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$/);
    await expect(service.verify(passwordHash, password)).resolves.toBe(true);
    await expect(service.verify(passwordHash, password.trim())).resolves.toBe(false);
  });

  it("rejects an incorrect password", async () => {
    const passwordHash = await service.hash("correct-password");

    await expect(service.verify(passwordHash, "incorrect-password")).resolves.toBe(false);
  });

  it("generates a different salt for each hash of the same password", async () => {
    const password = "same-password";
    const firstHash = await service.hash(password);
    const secondHash = await service.hash(password);

    expect(firstHash.split("$")[4]).not.toBe(secondHash.split("$")[4]);
    await expect(service.verify(firstHash, password)).resolves.toBe(true);
    await expect(service.verify(secondHash, password)).resolves.toBe(true);
  });

  it("distinguishes passwords that differ after the first 72 bytes", async () => {
    const prefix = "a".repeat(72);
    const passwordHash = await service.hash(`${prefix}x`);

    await expect(service.verify(passwordHash, `${prefix}x`)).resolves.toBe(true);
    await expect(service.verify(passwordHash, `${prefix}y`)).resolves.toBe(false);
  });

  it("propagates malformed stored hash errors", async () => {
    await expect(service.verify("invalid-hash", "password")).rejects.toThrow();
  });
});
