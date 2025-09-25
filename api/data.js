// Vercel Serverless Function
// This code will run on Vercel's servers.

import { MongoClient } from 'mongodb';

// Vercel automatically provides the MONGODB_URI you set in the project settings.
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

export default async function handler(request, response) {
  // Allow requests from all origins (CORS) - Important for local testing and deployment
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle pre-flight OPTIONS request for CORS
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  try {
    // Connect to your MongoDB cluster
    await client.connect();
    const database = client.db('colorSensorDB'); // You can name your database anything
    const collection = database.collection('readings'); // You can name your collection anything

    // --- Handle POST request from ESP32 ---
    if (request.method === 'POST') {
      const { red, green, blue } = request.body;
      const doc = { red, green, blue, timestamp: new Date() };
      
      // Insert the new document into the collection
      await collection.insertOne(doc);
      return response.status(201).json({ message: 'Data saved successfully' });
    }

    // --- Handle GET request from the frontend website ---
    if (request.method === 'GET') {
      // Find the most recent document, sorted by timestamp descending
      const latestReading = await collection.findOne({}, { sort: { timestamp: -1 } });
      
      // If no data exists yet, return a default gray color
      if (!latestReading) {
        return response.status(200).json({ red: 128, green: 128, blue: 128, timestamp: new Date() });
      }
      
      return response.status(200).json(latestReading);
    }

    // If the request is not POST or GET, return an error
    return response.status(405).json({ message: 'Method Not Allowed' });

  } catch (error) {
    console.error(error);
    return response.status(500).json({ message: 'Error connecting to database', error: error.message });
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
