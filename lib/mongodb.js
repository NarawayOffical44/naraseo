import mongoose from 'mongoose';

/**
 * MongoDB connection singleton
 * Prevents multiple connections in Next.js development
 * Falls back to in-memory storage if no MONGODB_URI
 */

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  // Already connected
  if (cached.conn) {
    return cached.conn;
  }

  // If no MongoDB URI, use mock in-memory storage
  if (!process.env.MONGODB_URI) {
    console.log('⚠️  No MONGODB_URI set. Using in-memory storage. Data will be lost on restart.');
    return getMockDB();
  }

  // Connect to MongoDB
  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose
      .connect(process.env.MONGODB_URI, opts)
      .then(mongoose => {
        console.log('✓ Connected to MongoDB');
        return mongoose;
      })
      .catch(err => {
        console.error('✗ MongoDB connection error:', err);
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

/**
 * Mock in-memory database for development/testing
 * Stores data in memory — lost on server restart
 */
function getMockDB() {
  const mockData = {
    AuditResult: [],
    User: [],
    KeywordRanking: [],
  };

  return {
    connection: {
      db: {
        collection: (name) => {
          return {
            insertOne: (doc) => Promise.resolve({ insertedId: Date.now() }),
            find: () => ({ toArray: () => Promise.resolve(mockData[name] || []) }),
            findOne: () => Promise.resolve(mockData[name]?.[0]),
            deleteMany: () => Promise.resolve({ deletedCount: 0 }),
          };
        }
      }
    },
    models: {},
  };
}

/**
 * Close database connection
 */
export async function closeDB() {
  if (cached.conn) {
    await cached.conn.disconnect();
    cached.conn = null;
    cached.promise = null;
  }
}
