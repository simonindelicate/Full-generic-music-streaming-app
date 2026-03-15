// server.js
const express = require('express');
const fileUpload = require('express-fileupload');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
client.connect();
const db = client.db('home-ed-ideas');
const imagesCollection = db.collection('julia');

// Enable express-fileupload middleware
app.use(fileUpload());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.post('/upload', async (req, res) => {
  try {
    if (!req.files || !req.body.title) {
      return res.status(400).send('No files or title were uploaded.');
    }

    // The name of the input field is used to retrieve the uploaded file
    const image = req.files.image;
    const title = req.body.title;
    const description = req.body.description;

    // Use the mv() method to place the file somewhere on your server
    const imagePath = path.join(__dirname, 'uploads', image.name);
    await image.mv(imagePath);

    // Save image data to MongoDB
    const newImage = {
      title,
      description,
      imagePath,
    };
    await imagesCollection.insertOne(newImage);

    res.send('File uploaded and data saved to MongoDB!');
  } catch (err) {
    console.error(err);
    res.status(500).send(err);
  }
});

app.listen(3000, () => {
  console.log('Server started on port 3000');
});