const Quiz = require('../models/Quiz');
const xlsx = require('xlsx');
const path = require('path');

// Create a new quiz
exports.createQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.create(req.body);
        res.status(201).json({
            success: true,
            data: quiz
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Copy quiz
exports.copyQuiz = async (req, res) => {
    try {
        const originalQuiz = await Quiz.findById(req.params.id);
        if (!originalQuiz) {
            return res.status(404).json({
                success: false,
                error: 'Quiz not found'
            });
        }

        // Create new quiz with same content but different title
        const newQuiz = new Quiz({
            title: `${originalQuiz.title} (Copy)`,
            description: originalQuiz.description,
            theme: originalQuiz.theme,
            questions: originalQuiz.questions,
            originalQuizId: originalQuiz._id
        });

        await newQuiz.save();

        res.status(201).json({
            success: true,
            data: newQuiz
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Get all quizzes
exports.getQuizzes = async (req, res) => {
    try {
        const quizzes = await Quiz.find({ archived: false });
        res.status(200).json({
            success: true,
            count: quizzes.length,
            data: quizzes
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Get archived quizzes
exports.getArchivedQuizzes = async (req, res) => {
    try {
        const quizzes = await Quiz.find({ archived: true });
        res.status(200).json({
            success: true,
            count: quizzes.length,
            data: quizzes
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Get single quiz
exports.getQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            return res.status(404).json({
                success: false,
                error: 'Quiz not found'
            });
        }
        res.status(200).json({
            success: true,
            data: quiz
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Update quiz
exports.updateQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        if (!quiz) {
            return res.status(404).json({
                success: false,
                error: 'Quiz not found'
            });
        }
        res.status(200).json({
            success: true,
            data: quiz
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Delete quiz
exports.deleteQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findByIdAndDelete(req.params.id);
        if (!quiz) {
            return res.status(404).json({
                success: false,
                error: 'Quiz not found'
            });
        }
        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Start quiz
exports.startQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            return res.status(404).json({ success: false, message: 'Quiz not found' });
        }

        quiz.isLive = true;
        quiz.currentQuestion = -1;
        quiz.sessionCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        quiz.activeParticipants = [];
        await quiz.save();

        // Emit initial participant count
        const io = req.app.get('io');
        io.to(quiz._id.toString()).emit('participant-count', { count: 0 });

        res.json({ 
            success: true, 
            data: { 
                sessionCode: quiz.sessionCode 
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// End quiz
exports.endQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            return res.status(404).json({ success: false, message: 'Quiz not found' });
        }

        // Archive current participants' results with their answers
        const currentResults = quiz.activeParticipants.map(participant => ({
            participantName: participant.name,
            score: participant.score,
            completedAt: new Date(),
            answers: participant.answers
        }));

        quiz.isLive = false;
        quiz.currentQuestion = -1;
        quiz.archived = true;
        quiz.archivedResults.push(...currentResults);
        quiz.activeParticipants = [];
        await quiz.save();

        res.json({ success: true, data: quiz });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Export quiz results
exports.exportQuizResults = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id)
            .populate('participants', 'name score answers');

        if (!quiz) {
            return res.status(404).json({ success: false, message: 'Quiz not found' });
        }

        // Create workbook
        const wb = xlsx.utils.book_new();
        
        // Participant results worksheet
        const participantData = quiz.archivedResults.map(result => ({
            'Participant Name': result.participantName,
            'Total Score': result.score,
            'Completed At': result.completedAt.toLocaleString()
        }));
        const participantWs = xlsx.utils.json_to_sheet(participantData);
        xlsx.utils.book_append_sheet(wb, participantWs, 'Participants');

        // Questions worksheet
        const questionData = quiz.questions.map((q, idx) => {
            const questionAnswers = quiz.archivedResults.flatMap(r => 
                r.answers.filter(a => a.questionIndex === idx)
            );
            
            return {
                'Question': q.questionText,
                'Correct Option': q.options.find(o => o.isCorrect).text,
                'All Options': q.options.map(o => o.text).join(', '),
                'Total Attempts': questionAnswers.length,
                'Correct Answers': questionAnswers.filter(a => a.isCorrect).length,
                'Average Time (seconds)': Math.round(questionAnswers.reduce((acc, curr) => acc + curr.timeTaken, 0) / questionAnswers.length),
                'Success Rate': `${Math.round((questionAnswers.filter(a => a.isCorrect).length / questionAnswers.length) * 100)}%`
            };
        });
        const questionWs = xlsx.utils.json_to_sheet(questionData);
        xlsx.utils.book_append_sheet(wb, questionWs, 'Questions');

        // Detailed answers worksheet
        const answerData = quiz.archivedResults.flatMap(result => 
            result.answers.map(answer => ({
                'Participant': result.participantName,
                'Question': quiz.questions[answer.questionIndex].questionText,
                'Answer': quiz.questions[answer.questionIndex].options[answer.answer].text,
                'Correct': answer.isCorrect ? 'Yes' : 'No',
                'Time Taken (seconds)': answer.timeTaken,
                'Points': answer.points
            }))
        );
        const answerWs = xlsx.utils.json_to_sheet(answerData);
        xlsx.utils.book_append_sheet(wb, answerWs, 'Detailed Answers');

        // Generate Excel file
        const filename = `quiz-results-${quiz._id}.xlsx`;
        const filePath = path.join(__dirname, '..', 'public', 'exports', filename);
        xlsx.writeFile(wb, filePath);

        res.json({
            success: true,
            data: {
                downloadUrl: `/exports/${filename}`
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update participant score
exports.updateParticipantScore = async (req, res) => {
    try {
        const { quizId, participantId, score } = req.body;
        
        const quiz = await Quiz.findById(quizId);
        if (!quiz || !quiz.isLive) {
            return res.status(404).json({ success: false, message: 'Active quiz not found' });
        }

        const participantIndex = quiz.activeParticipants.findIndex(
            p => p.participantId.toString() === participantId
        );

        if (participantIndex === -1) {
            return res.status(404).json({ success: false, message: 'Participant not found' });
        }

        quiz.activeParticipants[participantIndex].score = score;
        await quiz.save();

        res.json({ success: true, data: quiz.activeParticipants });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
