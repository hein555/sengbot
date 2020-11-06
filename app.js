'use strict';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL;

//new text

// Imports dependencies and set up http server
const 
  { uuid } = require('uuidv4'),
  {format} = require('util'),
  request = require('request'),
  express = require('express'),
  body_parser = require('body-parser'),
  firebase = require("firebase-admin"),
  ejs = require("ejs"),  
  fs = require('fs'),
  multer  = require('multer'),  
  app = express(); 

const uuidv4 = uuid();
const session = require('express-session');


app.use(body_parser.json());
app.use(body_parser.urlencoded());
app.use(session({secret: 'seng'}));

const bot_questions ={
"q1": "Please enter your name",
"q2": "Please enter phone number",
"q3": "Please enter address"
}

let sess;

let current_question = '';

/*
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
})*/

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits :{
    fileSize: 50 * 1024 * 1024  //no larger than 5mb
  }

});

// parse application/x-www-form-urlencoded


app.set('view engine', 'ejs');
app.set('views', __dirname+'/views');


var firebaseConfig = {
     credential: firebase.credential.cert({
    "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    "client_email": process.env.FIREBASE_CLIENT_EMAIL,
    "project_id": process.env.FIREBASE_PROJECT_ID,    
    }),
    databaseURL: process.env.FIREBASE_DB_URL,   
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  };



firebase.initializeApp(firebaseConfig);

let db = firebase.firestore(); 
let bucket = firebase.storage().bucket();

// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => console.log('webhook is listening'));

// Accepts POST requests at /webhook endpoint
app.post('/webhook', (req, res) => {  

  // Parse the request body from the POST
  let body = req.body;

  sess = req.session;

  

  // Check the webhook event is from a Page subscription
  if (body.object === 'page') {
    body.entry.forEach(function(entry) {

      let webhook_event = entry.messaging[0];
      let sender_psid = webhook_event.sender.id; 

      sess = req.session;
      if(!sess.user_id){
        sess.user_id = sender_psid;  
      } 

      if (webhook_event.message) {
        if(webhook_event.message.quick_reply){
            handleQuickReply(sender_psid, webhook_event.message.quick_reply.payload);
          }else{
            handleMessage(sender_psid, webhook_event.message);                       
          }                
      } else if (webhook_event.postback) {        
        handlePostback(sender_psid, webhook_event.postback);
      }
      
    });
    // Return a '200 OK' response to all events
    res.status(200).send('EVENT_RECEIVED');

  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }

});


app.use('/uploads', express.static('uploads'));


app.get('/',function(req,res){    
    res.send('your app is up and running');
});


app.get('/admin/roombookings', async function(req,res){
  const roombookingsRef = db.collection('roombookings');
  const snapshot = await roombookingsRef.get();
  if(snapshot.empty){
    res.send('no data');
  }

  let data = [];

  snapshot.forEach(doc => {
    let roombooking ={};
    roombooking = doc.data();
    roombooking.doc_id = doc.id;

    data.push(roombooking);
    
  });

  console.log('DATA:', data);

  res.render('roombookings.ejs', {data:data});
});

app.get('/admin/updateroombooking/:doc_id', async function(req,res){
  let doc_id = req.params.doc_id;
    
  const roombookingRef = db.collection('roombookings').doc(doc_id);
  const doc = await roombookingRef.get();
  if (!doc.exists){
    console.log('No such document!');s
  }else{
    console.log('Document data:', doc.data());
    let data = doc.data();
    data.doc_id = doc_id;

    console.log('Document data:', data);
    res.render('editroombookings.ejs',{data:data});
  }
});

app.post('/admin/updateroombooking/', async function(req,res){
  console.log('REQ:', req.body);

  // const roombookingRef = db.collection('roombookings').doc('DC');
  // const res  = await roombookingRef.update
    
  res.send('ok');
  // const roombookingRef = db.collection('roombookings').doc(doc_id);
  // const doc = await roombookingRef.get();
  // if (!doc.exists){
  //   console.log('No such document!');s
  // }else{
  //   console.log('Document data:', doc.data());
  //   let data = doc.data();
  //   res.render('editroombookings.ejs',{data:data});
  // }
});

/*********************************************
Gallery page
**********************************************/
app.get('/showimages/:sender_id/',function(req,res){
    const sender_id = req.params.sender_id;

    let data = [];

    db.collection("images").limit(20).get()
    .then(  function(querySnapshot) {
        querySnapshot.forEach(function(doc) {
            let img = {};
            img.id = doc.id;
            img.url = doc.data().url;         

            data.push(img);                      

        });
        console.log("DATA", data);
        res.render('gallery.ejs',{data:data, sender_id:sender_id, 'page-title':'welcome to my page'}); 

    }
    
    )
    .catch(function(error) {
        console.log("Error getting documents: ", error);
    });    
});


app.post('/imagepick',function(req,res){
      
  const sender_id = req.body.sender_id;
  const doc_id = req.body.doc_id;

  console.log('DOC ID:', doc_id); 

  db.collection('images').doc(doc_id).get()
  .then(doc => {
    if (!doc.exists) {
      console.log('No such document!');
    } else {
      const image_url = doc.data().url;

      console.log('IMG URL:', image_url);

      let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Is this the image you like?",
            "image_url":image_url,                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Yes!",
                  "payload": "yes",
                },
                {
                  "type": "postback",
                  "title": "No!",
                  "payload": "no",
                }
              ],
          }]
        }
      }
    }

  
    callSend(sender_id, response); 
    }
  })
  .catch(err => {
    console.log('Error getting document', err);
  });
      
});



/*********************************************
END Gallery Page
**********************************************/

//webview test
app.get('/webview/:sender_id',function(req,res){
    const sender_id = req.params.sender_id;
    res.render('webview.ejs',{title:"Hello!! from WebView", sender_id:sender_id});
});

app.post('/webview',upload.single('file'),function(req,res){
       
      let name  = req.body.name;
      let email = req.body.email;
      let img_url = "";
      let sender = req.body.sender;  

      console.log("REQ FILE:",req.file);



      let file = req.file;
      if (file) {
        uploadImageToStorage(file).then((img_url ) => {
         db.collection('webview').add({
            name: name,
            email: email,
            image: img_url
            }).then(success => {   
               console.log("DATA SAVED")
               thankyouReply(sender, name, img_url);    
            }).catch(error => {
              console.log(error);
            });
        }).catch((error) => {
          console.error(error);
        });
      }
 
              
});

//Set up Get Started Button. To run one time
//eg https://fbstarter.herokuapp.com/setgsbutton
app.get('/setgsbutton',function(req,res){
    setupGetStartedButton(res);    
});

//Set up Persistent Menu. To run one time
//eg https://fbstarter.herokuapp.com/setpersistentmenu
app.get('/setpersistentmenu',function(req,res){
    setupPersistentMenu(res);    
});

//Remove Get Started and Persistent Menu. To run one time
//eg https://fbstarter.herokuapp.com/clear
app.get('/clear',function(req,res){    
    removePersistentMenu(res);
});

//whitelist domains
//eg https://fbstarter.herokuapp.com/whitelists
app.get('/whitelists',function(req,res){    
    whitelistDomains(res);
});


// Accepts GET requests at the /webhook endpoint
app.get('/webhook', (req, res) => {
  

  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;  

  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];  
    
  // Check token and mode
  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);    
    } else {      
      res.sendStatus(403);      
    }
  }
});

/**********************************************
Function to Handle when user send quick reply message
***********************************************/

function handleQuickReply(sender_psid, received_message) {
  
  console.log('QUICK REPLY', received_message);

  received_message=received_message.toLowerCase();

  switch(received_message) {     
      case "register":
        current_question = "q1";
          botQuestions(current_question, sender_psid);
        break;
      case "shop":
          showShop(sender_psid);
        break;   
      case "confirm-register":
          saveRegistration([name:sess.user_name,phone:sess.user_phone,address:sess.user_address], sender_psid);
        break;             
      default:
          defaultReply(sender_psid);
  } 
}
/**********************************************
Function to Handle when user send text message
***********************************************/

const handleMessage = (sender_psid, received_message) => {

  console.log('TEXT REPLY', received_message);
  //let message;
  let response;

  if(received_message.attachments){
     handleAttachments(sender_psid, received_message.attachments);
  }else if(current_question == 'q1'){
    sess.user_name=received_message.text;
    console.log('NAME ENTERED: ', sess);
    current_question='q2';
    botQuestions(current_question,sender_psid);
  }else if(current_question == 'q2'){
    sess.user_phone=received_message.text;
    console.log('PH ENTERED: ', sess);
    current_question='q3';
    botQuestions(current_question,sender_psid);
  }else if(current_question == 'q3'){
    sess.user_address=received_message.text;
    console.log('ADD ENTERED: ', sess);
    current_question='';
    confirmRegister(sender_psid);
  }

  else {
      
      let user_message = received_message.text;

      user_message = user_message.toLowerCase(); 

      switch(user_message) { 
      
      case "order":
          appointment(sender_psid);
        break;
      case "start":{
        startGreeting(sender_psid);
        break;
      }
      case "text":
        textReply(sender_psid);
        break;
      case "button":
        buttonReply(sender_psid);
        break;
      case "webview":
        webviewTest(sender_psid);
        break;       
      case "show images":
        showImages(sender_psid)
        break;               
      default:
          defaultReply(sender_psid);
      }       
          
      
    }

}

/*********************************************
Function to handle when user send attachment
**********************************************/
const handleAttachments = (sender_psid, attachments) => {
  console.log('ATTACHMENT REPLY', attachments);
  let response; 
  let attachment_url = attachments[0].payload.url;
    response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Is this the right picture?",
            "subtitle": "Tap a button to answer.",
            "image_url": attachment_url,
            "buttons": [
              {
                "type": "postback",
                "title": "Yes!",
                "payload": "yes-attachment",
              },
              {
                "type": "postback",
                "title": "No!",
                "payload": "no-attachment",
              }
            ],
          }]
        }
      }
    }
    callSend(sender_psid, response);
}


/*********************************************
Function to handle when user click button
**********************************************/
const handlePostback = (sender_psid, received_postback) => {
  
  let payload = received_postback.payload;
  console.log('BUTTON PAYLOAD', payload);
  
  if(payload.startsWith("Product:")){
    let room_type=payload.slice(5);
    console.log("SELECTED ROOM IS: ", room_type);
    userInputs[user_id].room=room_type;
    console.log('TEST',userInputs);
    firstOrFollowup(sender_psid);
  }
  else{
      switch(payload) {        
      case "yes":
          showButtonReplyYes(sender_psid);
        break;
      case "no":
          showButtonReplyNo(sender_psid);
        break;                      
      default:
          defaultReply(sender_psid);
    }     
  }
}


const generateRandom = (length) => {
   var result           = '';
   var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
   var charactersLength = characters.length;
   for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}

/*********************************************
GALLERY SAMPLE
**********************************************/

const showImages = (sender_psid) => {
  let response;
  response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "show images",                       
            "buttons": [              
              {
                "type": "web_url",
                "title": "enter",
                "url":"https://fbstarter.herokuapp.com/showimages/"+sender_psid,
                 "webview_height_ratio": "full",
                "messenger_extensions": true,          
              },
              
            ],
          }]
        }
      }
    }
  callSendAPI(sender_psid, response);
}


/*********************************************
END GALLERY SAMPLE
**********************************************/


function webviewTest(sender_psid){
  let response;
  response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Click to open webview?",                       
            "buttons": [              
              {
                "type": "web_url",
                "title": "webview",
                "url":APP_URL+"webview/"+sender_psid,
                 "webview_height_ratio": "full",
                "messenger_extensions": true,          
              },
              
            ],
          }]
        }
      }
    }
  callSendAPI(sender_psid, response);
}


/****************
start room 
****************/
const appointment =(sender_psid) => {
  let response1 = {"text": "Welcome to SENG Shop"};
  let response2 = {
    "text": "Please Select Oil Cake or Peanut Oil",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"Oil Cake",
              "payload":"product:Product",              
            },{
              "content_type":"text",
              "title":"Peanut Oil",
              "payload":"product:Food",             
            }
    ]
  };
  callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2);
  });

}

// const showProduct =(sender_psid) => {
//   let response = {
//       "attachment": {
//         "type": "template",
//         "payload": {
//           "template_type": "generic",
//           "elements": [{
//             "title": "Olive Oil Cake",
//             "subtitle": "Bon Appetit",
//             "image_url":"https://i.pinimg.com/236x/f6/15/77/f61577e4eb47fb4f693fe4036b8fa7f6.jpg",                       
//             "buttons": [
//                 {
//                   "type": "postback",
//                   "title": "Olive Oil Cake",
//                   "payload": "Product:Olive Oil Cake",
//                 }
//               ],
//           },
//           {
//             "title": "Classic Olive Oil Cake",
//             "subtitle": "Bake from Scratch",
//             "image_url":"https://images-eu.ssl-images-amazon.com/images/I/51zOKAleUYL._SY300_QL70_ML2_.jpg",                       
//             "buttons": [
//                 {
//                   "type": "postback",
//                   "title": "Classic Olive Oil Cake",
//                   "payload": "Product:Classic Olive Oil Cake",
//                 }
//               ],
//           }
//           ]
//         }
//       }
//     }
//   callSend(sender_psid, response);

// }
/****************
end room 
****************/

/****************
startshop 
****************/
// const botQuestions = (current_question,sender_psid) => {
//   if(current_question =='q1'){
//     let response = {"text": bot_questions.q3};
//   callSend(sender_psid, response);
//   }else if(current_question =='q2'){
//     let response = {"text": bot_questions.q4};
//   callSend(sender_psid, response);
//   }else if(current_question =='q3'){
//     let response = {"text": bot_questions.q5};
//   callSend(sender_psid, response);
//   }

// }
const startGreeting =(sender_psid) => {
  let response = {"text": "Welcome to SENG Shop."};
  callSend(sender_psid, response).then(()=>{
    showMenu(sender_psid);  
  });
  
  
}
  
const showMenu = async(sender_psid) =>{
  let title = "";
  const userRef = db.collection('users').doc(sender_psid);
  const user = await userRef.get();
  if(!user.exists){
    title = "Register";
  }else{
    title = "Update Profile";
  }

  let response = {
    "text": "Select your reply",
    "quick_replies":[
            {
              "content_type":"text",
              "title":title,
              "payload":"register",              
            },{
              "content_type":"text",
              "title":"Shop",
              "payload":"shop",             
            }
    ]
  };
  callSend(sender_psid, response);
}

const showRegister =(sender_psid) => {
  let response = {"text": "You sent text message"};
  callSend(sender_psid, response);
}

const botQuestions = (current_question,sender_psid) => {
  if(current_question =='q1'){
    let response = {"text": bot_questions.q1};
  callSend(sender_psid, response);
  }else if(current_question =='q2'){
    let response = {"text": bot_questions.q2};
  callSend(sender_psid, response);
  }else if(current_question =='q3'){
    let response = {"text": bot_questions.q3};
  callSend(sender_psid, response);
  }

}

const confirmRegister = (sender_psid) => {
  console.log('SESSION:',sess);
   let Summary ="";
   Summary += "name:" + sess.user_name + "\u000A";
   Summary += "phone:" + sess.user_phone + "\u000A";
   Summary += "address:" + sess.user_address + "\u000A";
   
  let response1 = {"text": Summary};


  let response2 = {
    "text": "confirm to register",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"Confirm",
              "payload":"confirm-register",              
            },{
              "content_type":"text",
              "title":"Cancel",
              "payload":"off",             
            }
    ]
  };
  callSend(sender_psid, response1).then(() => {
    return callSend(sender_psid, response2);
  });

  }
  
const saveRegistration = async (arg, sender_psid) =>{
  let data = arg;
  let today = new Date();

  console.log();

  data.fid = sender_psid;
  data.create_on = today;
  data.point = 0;
  data.status = "pending";

  console.log('USER DATA', data);

  db.collection('users').doc(sender_psid).set(data).then((success)=>{
      console.log("SAVED", success);
      let text = "Thank you. You have been registered."+ "\u000A";
      let response = {"text": text};
      callSend(sender_psid, response);
    }).catch((err)=>{
        console.log('Error', err);
    });
  }

/****************
endshop
****************/

const textReply =(sender_psid) => {
  let response = {"text": "You sent text message"};
  callSend(sender_psid, response);
}

const buttonReply =(sender_psid) => {

  let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Are you OK?",
            "image_url":"https://www.mindrops.com/images/nodejs-image.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Yes!",
                  "payload": "yes",
                },
                {
                  "type": "postback",
                  "title": "No!",
                  "payload": "no",
                }
              ],
          }]
        }
      }
    }

  
  callSend(sender_psid, response);
}

const showButtonReplyYes =(sender_psid) => {
  let response = { "text": "You clicked YES" };
  callSend(sender_psid, response);
}

const showButtonReplyNo =(sender_psid) => {
  let response = { "text": "You clicked NO" };
  callSend(sender_psid, response);
}

const thankyouReply =(sender_psid, name, img_url) => {
  let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Thank you! " + name,
            "image_url":img_url,                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Yes!",
                  "payload": "yes",
                },
                {
                  "type": "postback",
                  "title": "No!",
                  "payload": "no",
                }
              ],
          }]
        }
      }
    }
  callSend(sender_psid, response);
}

function testDelete(sender_psid){
  let response;
  response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Delete Button Test",                       
            "buttons": [              
              {
                "type": "web_url",
                "title": "enter",
                "url":"https://fbstarter.herokuapp.com/test/",
                 "webview_height_ratio": "full",
                "messenger_extensions": true,          
              },
              
            ],
          }]
        }
      }
    }
  callSendAPI(sender_psid, response);
}

const defaultReply = (sender_psid) => {
  let response1 = {"text": "To test text reply, type 'text'"};
  let response2 = {"text": "To test quick reply, type 'quick'"};
  let response3 = {"text": "To test button reply, type 'button'"};   
  let response4 = {"text": "To test webview, type 'webview'"};
    callSend(sender_psid, response1).then(()=>{
      return callSend(sender_psid, response2).then(()=>{
        return callSend(sender_psid, response3).then(()=>{
          return callSend(sender_psid, response4);
        });
      });
  });  
}

const callSendAPI = (sender_psid, response) => {   
  let request_body = {
    "recipient": {
      "id": sender_psid
    },
    "message": response
  }
  
  return new Promise(resolve => {
    request({
      "uri": "https://graph.facebook.com/v6.0/me/messages",
      "qs": { "access_token": PAGE_ACCESS_TOKEN },
      "method": "POST",
      "json": request_body
    }, (err, res, body) => {
      if (!err) {
        //console.log('RES', res);
        console.log('BODY', body);
        resolve('message sent!')
      } else {
        console.error("Unable to send message:" + err);
      }
    }); 
  });
}

async function callSend(sender_psid, response){
  let send = await callSendAPI(sender_psid, response);
  return 1;
}


const uploadImageToStorage = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject('No image file');
    }
    let newFileName = `${Date.now()}_${file.originalname}`;

    let fileUpload = bucket.file(newFileName);

    const blobStream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
         metadata: {
            firebaseStorageDownloadTokens: uuidv4
          }
      }
    });

    blobStream.on('error', (error) => {
      console.log('BLOB:', error);
      reject('Something is wrong! Unable to upload at the moment.');
    });

    blobStream.on('finish', () => {
      // The public URL can be used to directly access the file via HTTP.
      //const url = format(`https://storage.googleapis.com/${bucket.name}/${fileUpload.name}`);
      const url = format(`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${fileUpload.name}?alt=media&token=${uuidv4}`);
      console.log("image url:", url);
      resolve(url);
    });

    blobStream.end(file.buffer);
  });
}




/*************************************
FUNCTION TO SET UP GET STARTED BUTTON
**************************************/

const setupGetStartedButton = (res) => {
  let messageData = {"get_started":{"payload":"get_started"}};

  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      form: messageData
    },
    function (error, response, body) {
      if (!error && response.statusCode == 200) {        
        res.send(body);
      } else { 
        // TODO: Handle errors
        res.send(body);
      }
  });
} 

/**********************************
FUNCTION TO SET UP PERSISTENT MENU
***********************************/



const setupPersistentMenu = (res) => {
  var messageData = { 
      "persistent_menu":[
          {
            "locale":"default",
            "composer_input_disabled":false,
            "call_to_actions":[
                {
                  "type":"postback",
                  "title":"View My Tasks",
                  "payload":"view-tasks"
                },
                {
                  "type":"postback",
                  "title":"Add New Task",
                  "payload":"add-task"
                },
                {
                  "type":"postback",
                  "title":"Cancel",
                  "payload":"cancel"
                }
          ]
      },
      {
        "locale":"default",
        "composer_input_disabled":false
      }
    ]          
  };
        
  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      form: messageData
  },
  function (error, response, body) {
      if (!error && response.statusCode == 200) {
          res.send(body);
      } else { 
          res.send(body);
      }
  });
} 

/***********************
FUNCTION TO REMOVE MENU
************************/

const removePersistentMenu = (res) => {
  var messageData = {
          "fields": [
             "persistent_menu" ,
             "get_started"                 
          ]               
  };  
  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'DELETE',
      headers: {'Content-Type': 'application/json'},
      form: messageData
  },
  function (error, response, body) {
      if (!error && response.statusCode == 200) {          
          res.send(body);
      } else {           
          res.send(body);
      }
  });
} 


/***********************************
FUNCTION TO ADD WHITELIST DOMAIN
************************************/

const whitelistDomains = (res) => {
  var messageData = {
          "whitelisted_domains": [
             APP_URL , 
             "https://herokuapp.com" ,                                   
          ]               
  };  
  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      form: messageData
  },
  function (error, response, body) {
      if (!error && response.statusCode == 200) {          
          res.send(body);
      } else {           
          res.send(body);
      }
  });
} 