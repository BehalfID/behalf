import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll } from "vitest";
import { connectToDatabase } from "@/lib/db";

let mongoServer: MongoMemoryServer | undefined;

const globalForMongoose = globalThis as typeof globalThis & {
  mongooseCache?: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    instance: { dbName: "behalfid-integration" }
  });
  process.env.MONGODB_URI = mongoServer.getUri();
  await connectToDatabase();
});

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({})
    )
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  if (globalForMongoose.mongooseCache) {
    globalForMongoose.mongooseCache.conn = null;
    globalForMongoose.mongooseCache.promise = null;
  }
  await mongoServer?.stop();
  delete process.env.MONGODB_URI;
});
