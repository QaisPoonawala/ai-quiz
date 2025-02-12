const Quiz = require('../models/Quiz');
const Participant = require('../models/Participant');
const xlsx = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/db');

// Start a live quiz session
exports.startLiveQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            return res.status(404).json({ success: false, error: 'Quiz not found' });
        }

        // Clear any existing participants for this quiz
        const participants = await Participant.findByQuizId(quiz.id);
        for (const participant of participants) {
            await Participant.delete(participant.id);
        }

        const sessionCode = uuidv4().substring(0, 6).toUpperCase();
        const updatedQuiz = await Quiz.findByIdAndUpdate(req.params.id, {
            isLive: 1,
            currentQuestion: -1,
            sessionCode: sessionCode,
            participants: []
        });

        res.status(200).json({
            success: true,
            data: {
                sessionCode: sessionCode,
                quizId: quiz.id
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
        
        // Use scan to find quiz by sessionCode
        const response = await docClient.send(new ScanCommand({
            TableName: Quiz.tableName,
            FilterExpression: 'sessionCode = :sessionCode and isLive = :isLive',
            ExpressionAttributeValues: {
                ':sessionCode': sessionCode,
                ':isLive': 1
            }
        }));
        const quizzes = response.Items;
        
        if (!quizzes || quizzes.length === 0) {
            return res.status(404).json({ success: false, error: 'Quiz session not found' });
        }
        const quiz = quizzes[0];

        // Create participant
        const participantId = uuidv4();
        const sessionId = uuidv4();
        const participant = {
            id: participantId,
            name,
            sessionId,
            quizId: quiz.id,
            score: 0,
            answers: [],
            connected: 1,
            lastActive: new Date().toISOString()
        };
        await Participant.create(participant);

        // Update quiz with new participant
        await Quiz.findByIdAndUpdate(quiz.id, {
            participants: [...(quiz.participants || []), participantId]
        });

        // Get all participants and emit updated count and names
        const allParticipants = await Participant.findByQuizId(quiz.id);
        const io = req.app.get('io');
        io.to(quiz.id.toString()).emit('participant-count', {
            count: allParticipants.length,
            participants: allParticipants.map(p => ({ name: p.name }))
        });

        res.status(200).json({
            success: true,
            data: {
                sessionId: sessionId,
                name: name,
                quizId: quiz.id
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
        if (!quiz || quiz.isLive !== 1) {
            return res.status(404).json({ success: false, error: 'Live quiz not found' });
        }

        const currentQuestion = quiz.currentQuestion + 1;
        const questionStartTime = new Date().toISOString();

        if (currentQuestion >= quiz.questions.length) {
            await Quiz.findByIdAndUpdate(req.params.id, {
                isLive: 0,
                currentQuestion: -1,
                sessionCode: ''
            });
            return res.status(200).json({ success: true, finished: true });
        }

        await Quiz.findByIdAndUpdate(req.params.id, {
            currentQuestion,
            questionStartTime
        });

        // Get leaderboard data
        const participants = await Participant.findByQuizId(quiz.id);

        const leaderboardData = participants
            .map(p => ({
                name: p.name,
                score: p.score || 0,
                answeredQuestions: (p.answers || []).length,
                correctAnswers: (p.answers || []).filter(a => a.isCorrect === 1).length
            }))
            .sort((a, b) => b.score - a.score);

        const nextQuestion = quiz.questions[currentQuestion];

        // Emit new question and leaderboard to all participants
        const io = req.app.get('io');
        
        // Get participant names
        const participantNames = participants.map(p => ({ name: p.name }));
        
        io.to(quiz.id.toString()).emit('participant-count', {
            count: participants.length,
            participants: participantNames
        });
        
        io.to(quiz.id.toString()).emit('new-question', {
            currentQuestion,
            question: nextQuestion,
            timeLimit: nextQuestion.timeLimit,
            questionStartTime: questionStartTime
        });
        io.to(quiz.id.toString()).emit('leaderboard-update', leaderboardData);
        res.status(200).json({
            success: true,
            data: {
                questionIndex: currentQuestion,
                timeLimit: nextQuestion.timeLimit,
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
        
        // Find participant by sessionId
        const participants = await Participant.findBySessionId(sessionId);
        
        if (!participants || participants.length === 0) {
            return res.status(404).json({ success: false, error: 'Participant not found' });
        }
        const participant = participants[0];

        // Get quiz
        const quiz = await Quiz.findById(participant.quizId);
        if (!quiz || quiz.isLive !== 1) {
            return res.status(400).json({ success: false, error: 'Quiz is not live' });
        }

        const currentQuestion = quiz.questions[quiz.currentQuestion];
        const timeTaken = (new Date() - new Date(quiz.questionStartTime)) / 1000;
        
        if (timeTaken > currentQuestion.timeLimit) {
            return res.status(400).json({ success: false, error: 'Time limit exceeded' });
        }

        // Validate answer index
        if (answer < 0 || answer >= currentQuestion.options.length) {
            return res.status(400).json({ success: false, error: 'Invalid answer index' });
        }

        const selectedOption = currentQuestion.options[answer];
        // Check if isCorrect is either 1 or true
        const isCorrect = selectedOption.isCorrect === 1 || selectedOption.isCorrect === true;

        console.log('Processing answer:', {
            questionIndex: quiz.currentQuestion,
            answerIndex: answer,
            optionSelected: selectedOption,
            isCorrect,
            timeTaken
        });

        // Calculate points (max 100)
        const timeLimit = currentQuestion.timeLimit || 30; // default 30 seconds if not specified
        let points = 0;
        if (isCorrect) {
            // For correct answers:
            // - If answered immediately (timeTaken = 0), get 100 points
            // - If answered at timeLimit, get 10 points
            // - Linear scale between these points
            const timeRatio = Math.min(timeTaken / timeLimit, 1); // Cap at 1 to prevent negative points
            points = Math.round(100 - (timeRatio * 90)); // Scales from 100 down to 10
            points = Math.max(10, points); // Ensure minimum 10 points for correct answers
        }

        console.log('Points calculation:', {
            isCorrect,
            timeTaken,
            timeLimit,
            timeRatio: timeTaken / timeLimit,
            calculatedPoints: points,
            finalPoints: points
        });

        // Update participant with new answer and score
        const currentScore = participant.score || 0;
        const newScore = currentScore + points;
        console.log('Score update:', {
            participantId: participant.id,
            oldScore: currentScore,
            pointsToAdd: points,
            newScore: newScore
        });

        const newAnswer = {
            questionIndex: quiz.currentQuestion,
            answeredAt: new Date().toISOString(),
            isCorrect: isCorrect ? 1 : 0,
            timeTaken,
            points,
            answer // Store which option was selected
        };

        try {
            await Participant.update(participant.id, {
                answers: [...(participant.answers || []), newAnswer],
                score: newScore,
                lastActive: new Date().toISOString()
            });
            console.log('Successfully updated participant score in DynamoDB');
        } catch (error) {
            console.error('Error updating participant:', error);
            throw error;
        }

        // Get updated leaderboard data
        const allParticipants = await Participant.findByQuizId(quiz.id);

        const leaderboardData = allParticipants
            .map(p => ({
                name: p.name,
                score: p.score || 0,
                answeredQuestions: (p.answers || []).length,
                correctAnswers: (p.answers || []).filter(a => a.isCorrect === 1).length
            }))
            .sort((a, b) => b.score - a.score);

        // Emit updated leaderboard to all participants
        const io = req.app.get('io');
        io.to(quiz.id.toString()).emit('leaderboard-update', leaderboardData);

        // Get updated participant data
        const updatedParticipant = await Participant.findById(participant.id);

        res.status(200).json({ 
            success: true, 
            data: { 
                isCorrect: isCorrect ? 1 : 0, 
                points,
                score: updatedParticipant.score || 0,
                leaderboard: leaderboardData
            } 
        });

        console.log('Answer submitted:', {
            participantId: participant.id,
            score: updatedParticipant.score,
            points,
            isCorrect
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Get leaderboard
exports.getLeaderboard = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            return res.status(404).json({ success: false, error: 'Quiz not found' });
        }

        // Get all participants for this quiz
        const participants = await Participant.findByQuizId(quiz.id);

        const leaderboard = participants
            .map(p => ({
                name: p.name,
                score: p.score || 0,
                answeredQuestions: (p.answers || []).length,
                correctAnswers: (p.answers || []).filter(a => a.isCorrect === 1).length
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
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            return res.status(404).json({ success: false, error: 'Quiz not found' });
        }

        // Get all participants for this quiz
        const participants = await Participant.find({
            FilterExpression: 'quizId = :quizId',
            ExpressionAttributeValues: {
                ':quizId': quiz.id
            }
        });

        const reportData = participants.map(p => ({
            'Participant Name': p.name,
            'Total Score': p.score,
            'Questions Attempted': p.answers.length,
            'Correct Answers': p.answers.filter(a => a.isCorrect === 1).length,
            'Average Time per Question': p.answers.reduce((acc, curr) => acc + curr.timeTaken, 0) / p.answers.length
        }));

        const questionStats = quiz.questions.map((q, idx) => {
            const attempts = quiz.participants.filter(p => 
                p.answers.some(a => a.questionIndex === idx)
            ).length;
            const correct = quiz.participants.filter(p =>
                p.answers.some(a => a.questionIndex === idx && a.isCorrect === 1)
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
