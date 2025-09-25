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

    // --- THIS IS THE CRUCIAL PART ---
    // Check if the request is a POST request from the ESP32
    if (req.method === 'POST') {
      const { red, green, blue } = req.body;

      // Simple validation
      if (typeof red === 'undefined' || typeof green === 'undefined' || typeof blue === 'undefined') {
        return res.status(400).json({ error: 'Missing RGB values in request body' });
      }

      // We will store only one document and continuously update it.
      // This is efficient for displaying the 'latest' color.
      const result = await collection.updateOne(
        { _id: 'latest_color' }, // A fixed ID to always update the same document
        { $set: { red, green, blue, timestamp: new Date() } },
        { upsert: true } // This creates the document if it doesn't exist
      );

      return res.status(200).json({ message: 'Color updated successfully', result });
    
    // Check if the request is a GET request from the browser
    } else if (req.method === 'GET') {
      const latestColor = await collection.findOne({ _id: 'latest_color' });

      if (latestColor) {
        // Don't send the internal _id or timestamp to the frontend
        return res.status(200).json({ 
          red: latestColor.red, 
          green: latestColor.green, 
          blue: latestColor.blue 
        });
      } else {
        // If no color has been sent yet, return a default gray color
        return res.status(200).json({ red: 128, green: 128, blue: 128 });
      }
    
    // If the method is neither GET nor POST
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to connect to database' });
  }
}

    

