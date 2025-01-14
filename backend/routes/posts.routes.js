//=====================================================
// POST.ROUTES.JS
// Diese Datei definiert die Routen für die Posts in der REST-Schnittstelle.
// Datum: 18.09.2023
//=====================================================

// Erforderliche Module importieren
const express = require('express');
const router = express.Router();
const Post = require('../models/posts')
const upload = require('../middleware/upload')
const mongoose = require('mongoose')
require('dotenv').config()

const ObjectId = require('mongodb').ObjectId

const connection = mongoose.createConnection(process.env.DB_CONNECTION, { useNewUrlParser: true, useUnifiedTopology: true, dbName: process.env.DB_NAME });
const webpush = require('web-push');

const publicVapidKey = 'BDy8zWY6tczZsikIyzU3Zl2150QNwnreBehIgz_s_5aOh6IbZYqS4pk2-xA86Gp-CuD9oVyK0St3u_wWMMR61Nc';
const privateVapidKey = 'NLBM2dvrkoS5DGPI96glceoBgFsGkqURU_V2GM3yDBY';
const pushSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/cMdUtRW4H9o:APA91bG8p3o-Ta31e1yMrqdvonJCyf3xbPfIFtpS2UbX9PcJwkeNKoQjZhEAWo5nad7eR3NgRQR8__3wk591j7DKWJLGzwWgJYm_GgipU0gTvMRpWA6TpmCtrD9OCo1mB0jZQrTj5a_5',
    keys: {
        auth: 'fJRvyO_fnPXsYeDkMy_jAA',
        p256dh: 'BDhH_TBG4l-PU3wJnT6wHqsPeYusbPqOiw7VvJvupXDC3JZOIIOiz2Ml8ZaZD9wJuGnXs9BFqINEzrFStsjkk6c',
    }
};

function sendNotification() {
    webpush.setVapidDetails('mailto:elisa.sedlak@student.htw-berlin.de', publicVapidKey, privateVapidKey);
    const payload = JSON.stringify({
        title: 'New Push Notification',
        content: 'New data in database!',
        openURL: '/help'
    });
    webpush.sendNotification(pushSubscription,payload)
        .catch(err => console.error(err));
    console.log('push notification sent');
    // res.status(201).json({ message: 'push notification sent'});
}

//-----------------------------------------------------------------
// POST One Post with single image-file
// Diese Route sendet das hochgeladene File an die Datenbank und übergibt die URL als Antwort
//-----------------------------------------------------------------
router.post('/', upload.single('file'), async(req, res) => {
    if(req.file === undefined)
    {
        return res.send({
            "message": "no file selected"
        })
    } else {
        console.log('req.body', req.body);
        console.log('req.file', req.file);
        const newPost = new Post({
            title: req.body.title,
            location: req.body.location,
            image_id: req.file.filename
        })
        console.log('newPost', newPost)
        await newPost.save();
        sendNotification();
        res.send(newPost)
    }
})

//-----------------------------------------------------------------
// GET One Post
// Diese Funktion sucht und gibt das Elemente in der Datenbank anhand der ID zurück.
//-----------------------------------------------------------------

function getOnePost(id) {
    return new Promise( async(resolve, reject) => {
        try {
            //console.log(id);
            const post = await Post.findOne({ _id: id });
            let fileName = post.image_id;
            const files = connection.collection('posts.files');
            const chunks = connection.collection('posts.chunks');

            const cursorFiles = files.find({filename: fileName});
            const allFiles = await cursorFiles.toArray();
            const cursorChunks = chunks.find({files_id : allFiles[0]._id});
            const sortedChunks = cursorChunks.sort({n: 1});
            let fileData = [];
            for await (const chunk of sortedChunks) {
                fileData.push(chunk.data.toString('base64'));
            }
            let base64file = 'data:' + allFiles[0].contentType + ';base64,' + fileData.join('');
            let getPost = new Post({
                "_id": post._id,
                "title": post.title,
                "location": post.location, 
                "image_id": base64file
            });
            //console.log('getPost', getPost)
            resolve(getPost)
        } catch {
            reject(new Error("Post does not exist!"));
        }
    })
}

//-----------------------------------------------------------------
// GET all Posts
// Diese Funktion sucht und gibt alle Elemente in der Datenbank als Antwort aus.
// Sie ruft für jeden gefundenen Post die funktion GetOnePost auf
//-----------------------------------------------------------------
function getAllPosts() {
	return new Promise( async(resolve, reject) => {
		const sendAllPosts = [];
		const allPosts = await Post.find();
		try {
			for(const post of allPosts) {
				// console.log('post', post)
				const onePost = await getOnePost(post._id);
				sendAllPosts.push(onePost);
			}
			// console.log('sendAllPosts', sendAllPosts)
			resolve(sendAllPosts)
		} catch {
				reject(new Error("Posts do not exist!"));
    }
	});
}

//-----------------------------------------------------------------
// GET one post by id
// \id: ID des gesuchten Posts
// Diese Route sucht nach einem Post in der Datenbank anhand seiner ID und sendet ihn als Antwort.
//-----------------------------------------------------------------
router.get('/:id', async(req, res) => {

    const id_obj = new ObjectId(req.params.id);
    getOnePost(id_obj)
    .then( (post) => {
        console.log('post', post);
        res.send(post);
    })
    .catch( () => {
        // Fehlerfall: ID existiert nicht, daher Statuscode 404 und Fehlermeldung senden
        res.status(404);
        res.send({
            error: "Post does not exist!"
        });
    })
});

//-----------------------------------------------------------------
// GET all posts
// Diese Route sucht alle Posts in der Datenbank und sendet sie als Antwort.
//-----------------------------------------------------------------
router.get('/', async(req, res) => {
    
    getAllPosts()
    .then( (posts) => {
        res.send(posts);
    })
    .catch( () => {
        // Fehlerfall: ID existiert nicht, daher Statuscode 404 und Fehlermeldung senden
        res.status(404);
        res.send({
            error: "Post do not exist!"
        });
    })
});


//-----------------------------------------------------------------
//  DELETE one post via id
//  \id: ID des gesuchten Posts
//  Diese Route löscht einen Post aus der Datenbank anhand seiner ID.
//-----------------------------------------------------------------
router.delete('/:id', async (req, res) => {
    try {
        // Erzeugt ein MongoDB-Objekt-ID aus dem in der Anfrage übergebenen ID-Parameter
        const id_obj = new ObjectId(req.params.id);
        
        const collection = connection.collection('posts');
        const filesCollection = connection.collection('posts.files');
        const chunksCollection = connection.collection('posts.chunks');

        // Löscht den Post in der Datenbank anhand der ID
        const post = await collection.findOne({ _id: id_obj });
        
        if (!post) {
            // Wenn der Post nicht gefunden wurde, sende Statuscode 404 und Fehlermeldung
            res.status(404);
            res.send({ error: "Post does not exist!" });
            return; // Beende die Funktion hier, um Doppel-Löschvorgänge zu verhindern
        }
        
        // Finde alle Dateidokumente mit dem gleichen Dateinamen in der "files"-Sammlung
        const files = await filesCollection.findOne({ filename: post.image_id });
        
        // Lösche alle Datei-Chunks, die mit den Dateidokumenten verknüpft sind
        await chunksCollection.deleteMany({ files_id: files._id });

        // Lösche alle Dateidokumente mit dem gleichen Dateinamen
        await filesCollection.deleteOne({ filename: post.image_id });

        // Lösche den Post aus der Haupt-Collection
        const deletePost = await collection.deleteOne({ _id: id_obj });

        // Wenn der Post erfolgreich gelöscht wurde, sende Statuscode 204 (Erfolgreich, keine Inhaltsangabe)
        if (deletePost.deletedCount === 1) {
            res.status(204)
            res.send({ message: "deleted" })
        } else {
            // Wenn der Post nicht gefunden wurde, sende Statuscode 404 und Fehlermeldung
            res.status(404)
            res.send({ error: "Post does not exist!" })
        }
    } catch {
        // Fehlerfall: Etwas ist schiefgelaufen, daher Statuscode 404 und Fehlermeldung senden
        res.status(404)
        res.send({ error: "something wrong" })
    }
});

module.exports = router;