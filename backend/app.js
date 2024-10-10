const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { GridFSBucket } = require('mongodb');
const Grid = require('gridfs-stream');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Allow CORS for your frontend origin
app.use(cors({
    origin: 'https://super-pancake-r4g5qrvpwvrqfwjv9-3001.app.github.dev', // Change to your frontend URL
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true, // If you need to send cookies or HTTP auth information
  }));
  
// Middleware
app.use(bodyParser.json());

app.use((req, res, next) => {
    console.log(req.headers);
    next();
  });
  

// MongoDB URI
const mongoURI = 'mongodb+srv://bhardwajharsh202:Kutta203@cluster0.e92v7nf.mongodb.net/free-music';

// Create a MongoDB connection
const conn = mongoose.createConnection(mongoURI);


// Init gfs
let gfs;
let gridFSBucket;

conn.once('open', () => {
    // Initialize stream
    gridFSBucket = new GridFSBucket(conn.db, { bucketName: 'musicFiles' });
    gfs = Grid(conn.db, mongoose.mongo);
    gfs.collection('musicFiles');
});

// Set up storage engine for Multer (store in memory before GridFS upload)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Define the schema for metadata
const musicSchema = new mongoose.Schema({
    title: String,
    singer: String,
    category: String,
    imageUrl: String, // URL of the album art or image
    fileId: mongoose.Schema.Types.ObjectId, // Reference to the file stored in GridFS
});

const Music = mongoose.model('Music', musicSchema);

app.get('/', async(req,res)=>{
    try {
        res.json({status:"server is runing"})
    } catch (error) {
        res.status(500).json({errror:"Internal server error"})
    }
})

// Upload a music file along with metadata
app.post('/upload', upload.single('music'), (req, res) => {
    if (!req.file || !req.body.title || !req.body.singer || !req.body.category || !req.body.imageUrl) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Upload the music file to GridFS
    const writeStream = gridFSBucket.openUploadStream(req.file.originalname, {
        metadata: { contentType: req.file.mimetype },
    });

    writeStream.end(req.file.buffer);

    writeStream.on('finish', async (file) => {
        // Store metadata in a separate MongoDB collection
        const newMusic = new Music({
            title: req.body.title,
            singer: req.body.singer,
            category: req.body.category,
            imageUrl: req.body.imageUrl,
            fileId: file._id,
        });

        try {
            await newMusic.save();
            res.status(200).json({
                message: 'Music uploaded successfully',
                file: newMusic,
            });
        } catch (error) {
            res.status(500).json({ error: 'Error saving metadata' });
        }
    });

    writeStream.on('error', (err) => {
        res.status(500).json({ error: 'Error uploading file', details: err });
    });
});

// Get all music files with metadata
app.get('/music', async (req, res) => {
    try {
        const musicFiles = await Music.find();
        res.json(musicFiles);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching music files' });
    }
});

// Stream a music file by its title
app.get('/music/:id/stream', (req, res) => {
    const musicId = req.params.id;

    // Find the metadata to get the fileId from GridFS
    Music.findById(musicId, (err, music) => {
        if (err || !music) {
            return res.status(404).json({ error: 'Music not found' });
        }

        // Stream the music file from GridFS
        gridFSBucket.openDownloadStream(music.fileId).pipe(res).on('error', (err) => {
            res.status(500).json({ error: 'Error streaming file' });
        });
    });
});

// Delete a music file by its ID
app.delete('/music/:id', async (req, res) => {
    const musicId = req.params.id;

    try {
        const music = await Music.findById(musicId);

        if (!music) {
            return res.status(404).json({ error: 'Music not found' });
        }

        // Delete the file from GridFS
        await gridFSBucket.delete(music.fileId);

        // Delete the metadata from the database
        await Music.findByIdAndDelete(musicId);

        res.status(200).json({ message: 'Music deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting music' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
