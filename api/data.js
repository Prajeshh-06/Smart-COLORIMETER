import { MongoClient } from 'mongodb';

// Get your MongoDB connection string from Vercel's environment variables
const uri = process.env.MONGODB_URI;
const options = {};

let client;
let clientPromise;

if (!process.env.MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

// In development mode, use a global variable so that the value
// is preserved across module reloads caused by HMR (Hot Module Replacement).
if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default async function handler(req, res) {
  try {
    const client = await clientPromise;
    const db = client.db("colorimeter_db"); // Use a database name
    const collection = db.collection("readings"); // Use a collection name

    // --- 1. HANDLE POST REQUESTS ---
    if (req.method === 'POST') {
      const { red, green, blue, scan } = req.body;

      // --- 1a. POST from Postman to request a scan ---
      if (typeof scan !== 'undefined' && scan === true) {
        // Set the scan request flag in the database
        await collection.updateOne(
          { _id: 'scan_control' },
          { $set: { scan_requested: true, timestamp: new Date() } },
          { upsert: true }
        );
        return res.status(200).json({ message: 'Scan successfully requested.' });
      }

      // --- 1b. POST from ESP32 with new color data ---
      if (typeof red !== 'undefined' && typeof green !== 'undefined' && typeof blue !== 'undefined') {
        // Store the latest color
        await collection.updateOne(
          { _id: 'latest_color' }, // A fixed ID to always update the same document
          { $set: { red, green, blue, timestamp: new Date() } },
          { upsert: true } // This creates the document if it doesn't exist
        );
        return res.status(200).json({ message: 'Color updated successfully' });
      }

      // --- 1c. Invalid POST request ---
      return res.status(400).json({ error: 'Invalid POST body. Must include {scan: true} or {red, green, blue}.' });

    // --- 2. HANDLE GET REQUESTS ---
    } else if (req.method === 'GET') {
      
      // Check for a query parameter. Your ESP32 will use this.
      // e.g., /api/data?client=esp32
      const isEsp32 = req.query.client === 'esp32';

      if (isEsp32) {
        // --- 2a. GET from ESP32: Check for scan request ---
        const scanControl = await collection.findOne({ _id: 'scan_control' });

        if (scanControl && scanControl.scan_requested === true) {
          // Found a scan request! Tell the ESP32 to scan.
          
          // IMPORTANT: Immediately set the flag back to false
          // so the ESP32 only scans once.
          await collection.updateOne(
            { _id: 'scan_control' },
            { $set: { scan_requested: false } }
          );
          
          // Send the "scan" command
          return res.status(200).json({ scan_requested: true });
        } else {
          // No scan request, tell ESP32 to wait.
          return res.status(200).json({ scan_requested: false });
        }
        
      } else {
        // --- 2b. GET from Website: Get the latest color ---
        const latestColor = await collection.findOne({ _id: 'latest_color' });

        if (latestColor) {
          return res.status(200).json({
            red: latestColor.red,
            green: latestColor.green,
            blue: latestColor.blue
          });
        } else {
          // If no color has been sent yet, return a default
          return res.status(200).json({ red: 128, green: 128, blue: 128 });
        }
      }

    // --- 3. HANDLE OTHER METHODS ---
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to connect to database' });
  }
}
