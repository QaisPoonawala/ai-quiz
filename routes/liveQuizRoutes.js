const express = require('express');
const router = express.Router();
const {
    startLiveQuiz,
    joinQuiz,
    nextQuestion,
    submitAnswer,
    getLeaderboard,
    generateReport
} = require('../controllers/liveQuizController');

router.post('/start/:id', startLiveQuiz);
router.post('/join', joinQuiz);
router.post('/next/:id', nextQuestion);
router.post('/submit', submitAnswer);
router.get('/leaderboard/:id', getLeaderboard);
router.get('/report/:id', generateReport);

module.exports = router;
