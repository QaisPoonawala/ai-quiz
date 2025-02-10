const Quiz = require('../models/Quiz');
const Participant = require('../models/Participant');
const xlsx = require('xlsx');
const { v4: uuidv4 } = require('uuid');

// Start a live quiz session
exports.startLiveQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            return res.status(404).json({ success: false, error: 'Quiz not found' });
        }

        quiz.isLive = true;
        quiz.currentQuestion = -1;
        quiz.sessionCode = uuidv4().substring(0, 6).toUpperCase();
        await quiz.save();

        res.status(200).json({
            success: true,
            data: {
                sessionCode: quiz.sessionCode,
                quizId: quiz._id
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Join a live quiz
exports.joinQuiz = async (req, res) => {
    try {
        const { sessionCode, name } = req.body;
        const quiz = await Quiz.findOne({ sessionCode, isLive: true });
        
        if (!quiz) {
            return res.status(404).json({ success: false, error: 'Quiz session not found' });
        }

        const participant = await Participant.create({
            name,
            sessionId: uuidv4(),
            quizId: quiz._id
        });

        quiz.participants.push(participant._id);
        await quiz.save();

        res.status(200).json({
            success: true,
            data: {
                sessionId: participant.sessionId,
                name: participant.name,
                quizId: quiz._id
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Move to next question
exports.nextQuestion = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz || !quiz.isLive) {
            return res.status(404).json({ success: false, error: 'Live quiz not found' });
        }

        quiz.currentQuestion++;
        quiz.questionStartTime = new Date();
        await quiz.save();

        if (quiz.currentQuestion >= quiz.questions.length) {
            quiz.isLive = false;
            await quiz.save();
            return res.status(200).json({ success: true, finished: true });
        }

        // Get leaderboard data
        const leaderboard = await Participant.find({ quizId: quiz._id })
            .select('name score answers')
            .sort('-score');

        const leaderboardData = leaderboard.map(p => ({
            name: p.name,
            score: p.score,
            answeredQuestions: p.answers.length,
            correctAnswers: p.answers.filter(a => a.isCorrect).length
        }));

        // Emit new question and leaderboard to all participants
        const io = req.app.get('io');
        io.to(quiz._id.toString()).emit('new-question', {
            question: quiz.questions[quiz.currentQuestion],
            timeLimit: quiz.questions[quiz.currentQuestion].timeLimit,
            questionStartTime: quiz.questionStartTime
        });
        io.to(quiz._id.toString()).emit('leaderboard-update', leaderboardData);

        res.status(200).json({
            success: true,
            data: {
                questionIndex: quiz.currentQuestion,
                timeLimit: quiz.questions[quiz.currentQuestion].timeLimit,
                leaderboard: leaderboardData
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Submit answer
exports.submitAnswer = async (req, res) => {
    try {
        const { sessionId, answer } = req.body;
        const participant = await Participant.findOne({ sessionId });
        const quiz = await Quiz.findById(participant.quizId);

        if (!quiz || !quiz.isLive) {
            return res.status(400).json({ success: false, error: 'Quiz is not live' });
        }

        const currentQuestion = quiz.questions[quiz.currentQuestion];
        const timeTaken = (new Date() - quiz.questionStartTime) / 1000;
        
        if (timeTaken > currentQuestion.timeLimit) {
            return res.status(400).json({ success: false, error: 'Time limit exceeded' });
        }

        const isCorrect = currentQuestion.options[answer].isCorrect;
        const scoreIncrement = isCorrect ? Math.max(10, Math.floor(20 - timeTaken)) : 0;

        participant.answers.push({
            questionIndex: quiz.currentQuestion,
            answeredAt: new Date(),
            isCorrect,
            timeTaken
        });
        participant.score += scoreIncrement;
        participant.lastActive = new Date();
        await participant.save();

        // Get updated leaderboard data
        const leaderboard = await Participant.find({ quizId: quiz._id })
            .select('name score answers')
            .sort('-score');

        const leaderboardData = leaderboard.map(p => ({
            name: p.name,
            score: p.score,
            answeredQuestions: p.answers.length,
            correctAnswers: p.answers.filter(a => a.isCorrect).length
        }));

        // Emit updated leaderboard to all participants
        const io = req.app.get('io');
        io.to(quiz._id.toString()).emit('leaderboard-update', leaderboardData);

        res.status(200).json({ 
            success: true, 
            data: { 
                isCorrect, 
                score: participant.score,
                leaderboard: leaderboardData
            } 
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Get leaderboard
exports.getLeaderboard = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id)
            .populate('participants', 'name score answers');

        if (!quiz) {
            return res.status(404).json({ success: false, error: 'Quiz not found' });
        }

        const leaderboard = quiz.participants
            .map(p => ({
                name: p.name,
                score: p.score,
                answeredQuestions: p.answers.length,
                correctAnswers: p.answers.filter(a => a.isCorrect).length
            }))
            .sort((a, b) => b.score - a.score);

        res.status(200).json({ success: true, data: leaderboard });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Generate report
exports.generateReport = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id)
            .populate('participants', 'name score answers');

        if (!quiz) {
            return res.status(404).json({ success: false, error: 'Quiz not found' });
        }

        const reportData = quiz.participants.map(p => ({
            'Participant Name': p.name,
            'Total Score': p.score,
            'Questions Attempted': p.answers.length,
            'Correct Answers': p.answers.filter(a => a.isCorrect).length,
            'Average Time per Question': p.answers.reduce((acc, curr) => acc + curr.timeTaken, 0) / p.answers.length
        }));

        const questionStats = quiz.questions.map((q, idx) => {
            const attempts = quiz.participants.filter(p => 
                p.answers.some(a => a.questionIndex === idx)
            ).length;
            const correct = quiz.participants.filter(p =>
                p.answers.some(a => a.questionIndex === idx && a.isCorrect)
            ).length;

            return {
                'Question': q.questionText,
                'Total Attempts': attempts,
                'Correct Answers': correct,
                'Success Rate': `${Math.round((correct/attempts) * 100)}%`
            };
        });

        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(reportData), 'Participants');
        xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(questionStats), 'Questions');

        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=quiz-report-${quiz._id}.xlsx`);
        res.send(buffer);
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
