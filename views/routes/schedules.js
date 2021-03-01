const router = require('express').Router();
var mongoose = require('mongoose');

router.get('/', (req, res) => {
	if(!req.user){
		res.render('pages/error.ejs')
	} else{
		res.render('pages/about.ejs')
	}

});

module.exports = router;