// load the things we need
var express = require('express');
var bodyParser     = require("body-parser");
var cookieParser   = require("cookie-parser");
var cookieSession  = require("cookie-session");
var passport       = require("passport");
var twitchStrategy = require("passport-twitch-new").Strategy;
var schedule = require('node-schedule')
var api = require('twitch-api-v5');
var Agenda = require('agenda');
var MongoClient = require('mongodb').MongoClient;
var tmi = require('tmi.js');
var mongoose = require('mongoose');
require('dotenv').config()

var url = process.env.DB_URL;
var db = mongoose.connection;

api.clientID = process.env.CLIENT_ID;


var Schema = mongoose.Schema;
var UserSchema = new Schema({
  twitchId: String,
});
var ScheduleSchema = new Schema({
    OAuth: String,
    channel: String,
    message: String,
    interval: Number,
    ownedBy: String,

})
var UserSched = mongoose.model('UserSched', UserSchema);
var Schedules = mongoose.model('Schedules', ScheduleSchema);

mongoose.connect(url, {useNewUrlParser: true, useUnifiedTopology: true});


const agenda = new Agenda().mongo(db, 'jobs');

agenda.define(
  "message",
  async (job) => {
    console.log('Scheduling Job')

    const client = new tmi.Client({
    options: { debug: true, messagesLogLevel: "info" },
    connection: {
        reconnect: true,
        secure: true
    },
    identity: {
        username: job.attrs.data.user.name,
        password: job.attrs.data.schedule.OAuth
    },
    channels: [ job.attrs.data.schedule.channel ]
    });
    await client.connect().catch(console.error);
    client.say(job.attrs.data.schedule.channel, job.attrs.data.schedule.message);
    client.disconnect()


    if(job.attrs.data.schedule.interval === 1){
        job.repeatEvery('1 hour', {
        skipImmediate: false
    })
    } else{
        job.repeatEvery(`${job.attrs.data.schedule.interval} hours`, {
        skipImmediate: false
    })
    }

    job.save()
  }
);




db.on('error', console.error.bind(console, 'MongoDB connection error:'));


var app = express();
// set the view engine to ejs
app.set('view engine', 'ejs');

// use res.render to load up an ejs view file
// Middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cookieSession({
   maxAge: 24 * 60 * 60 * 1000,
   keys: [process.env.COOKIE_KEY]
}));

app.use(passport.initialize());
app.use(passport.session())
passport.use(new twitchStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.ROOT_URL + "/auth/twitch/callback",
    scope: "user_read"
  },
  function(accessToken, refreshToken, profile, done) {
    // Suppose we are using mongo..
    UserSched.findOne({ twitchId: profile.id }, function (err, user) {
        if(!user){
            console.log('User not found, creating...')
            toAdd = new UserSched({twitchId: profile.id})
            toAdd.save()
            done(null, toAdd);
        } else{
            console.log('User found')
            done(null, user);
        }
    });
  }
));
 
passport.serializeUser(function(user, done) {
    done(null, user.twitchId);
});
 
passport.deserializeUser(function(id, done) {
    UserSched.findOne({twitchId : id}, function (err, user){
        done(null, user);
    })
});


app.use(express.urlencoded({
  extended: true
}))


// index page 
app.get('/', function(req, res) {
    if(req.user && req.user.twitchId){
            UserSched.findOne({twitchId : req.user.twitchId}, function(err, user){
        if(!user){
            var loggedIn = false
        } else{
            var loggedIn = true
        }
    })
    } else{
        var loggedIn = false
    }
    


    res.render('pages/index', {
        loggedIn: loggedIn
    });
});



app.get("/auth/twitch", passport.authenticate("twitch"));
app.get("/auth/twitch/callback", passport.authenticate("twitch", { failureRedirect: "/" }), function(req, res) {
    // Successful authentication, redirect home.
    req.session.save(function (err){
        // session saved
    })
    res.redirect("/schedules");
});

app.post('/submit-form', (req, res) => {
  console.log(req.body)
  console.log(req.user)
  Schedules.findOne({ownedBy: req.user.twitchId}, function(err, user){
      if(!user){
          scheduled = new Schedules({
              ownedBy: req.user.twitchId,
              OAuth: req.body.oauth,
              channel: req.body.channel,
              message: req.body.message,
              interval: req.body.interval,
          })
          scheduled.save()
          console.log(scheduled)
          res.render('pages/about.ejs', {schedule: scheduled})
          api.users.userByID({ userID: scheduled.ownedBy }, (err, res) => {
                if(err) {
                    console.log(err);
                } else {
                    agenda.schedule(new Date(Date.now() + 1000), 'message', {schedule: scheduled, user: res});
                }   
           });
          

          
      } else{
          res.send('You already have a scheduled message! Remove the old one to start a new one.')
      }

  })
})

app.get('/schedules', (req, res) => {
    if(!req.user){
        res.render('pages/error.ejs')
    } else{
        Schedules.findOne({ownedBy: req.user.twitchId}, function(err, schedule){
            if(!schedule){
                res.render('pages/about.ejs')
            } else{
                res.render('pages/about.ejs', {schedule: schedule})
            }
        })
    }
});

app.post('/deleteschedule', (req, res) => {
    Schedules.findOneAndRemove({ownedBy: req.user.twitchId}, function(err, schedule){
        console.log('Removing...')
    });
    MongoClient.connect(url, async function(err, dab) {
        database = dab.db("myFirstDatabase")
        const query = { "data.schedule.ownedBy": req.user.twitchId };
        const result = await database.collection('jobs').deleteOne(query);

}); 


    res.redirect('/schedules')

})

app.listen(8080);
console.log('8080 is the magic port');


agenda.start();