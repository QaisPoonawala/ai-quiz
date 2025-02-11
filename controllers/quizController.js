const Quiz = require('../models/Quiz');
const Participant = require('../models/Participant');
const xlsx = require('xlsx');
const path = require('path');

// Create a new quiz
exports.createQuiz = async (req, res) => {
    try {
        // Enhanced logging
        console.log('Received quiz creation request');
        console.log('Request body:', JSON.stringify(req.body, null, 2));

        // Validate required fields
        if (!req.body.title) {
            console.error('Quiz creation failed: Missing title');
            return res.status(400).json({
                success: false,
                error: 'Quiz title is required'
            });
        }

        // Ensure questions are in the correct format
        const quizData = {
            title: req.body.title,
            description: req.body.description || '',
            questions: req.body.questions || [],
            theme: req.body.theme || {
                backgroundColor: '#ffffff',
                textColor: '#333333',
                accentColor: '#007bff'
            }
        };

        // Detailed logging of processed quiz data
        console.log('Processed quiz data:', JSON.stringify(quizData, null, 2));

        try {
            const quiz = await Quiz.create(quizData);
            console.log('Quiz created successfully:', JSON.stringify(quiz, null, 2));
            
            res.status(201).json({
                success: true,
                data: quiz
            });
        } catch (createError) {
            console.error('DynamoDB create error:', createError);
            res.status(500).json({
                success: false,
                error: 'Failed to create quiz in database',
                details: createError.message,
                stack: createError.stack
            });
        }
    } catch (error) {
        console.error('Unexpected error in quiz creation:', error);
        res.status(500).json({
            success: false,
            error: 'Unexpected error occurred',
            details: error.message,
            stack: error.stack
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
        const newQuiz = await Quiz.create({
            title: `${originalQuiz.title} (Copy)`,
            description: originalQuiz.description,
            theme: originalQuiz.theme,
            questions: originalQuiz.questions,
            originalQuizId: originalQuiz.id
        });

        res.status(201).json({
            success: true,
            data: newQuiz
        });
    } catch (error) {
        console.error('Error copying quiz:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Get all quizzes
exports.getQuizzes = async (req, res) => {
    try {
        console.log('Getting all quizzes');
        const quizzes = await Quiz.find({ archived: 0 });
        console.log('Found quizzes:', quizzes);
        res.status(200).json({
            success: true,
            count: quizzes.length,
            data: quizzes
        });
    } catch (error) {
        console.error('Error getting quizzes:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Get archived quizzes
exports.getArchivedQuizzes = async (req, res) => {
    try {
        const quizzes = await Quiz.find({ archived: 1 });
        res.status(200).json({
            success: true,
            count: quizzes.length,
            data: quizzes
        });
    } catch (error) {
        console.error('Error getting archived quizzes:', error);
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
        console.error('Error getting quiz:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Update quiz
exports.updateQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findByIdAndUpdate(req.params.id, req.body);
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
        console.error('Error updating quiz:', error);
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
        console.error('Error deleting quiz:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// Start quiz
exports.startQuiz = async (req, res) => {
    try {
        const sessionCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const quiz = await Quiz.startQuiz(req.params.id, sessionCode);
        if (!quiz) {
            return res.status(404).json({ success: false, message: 'Quiz not found' });
        }

        // Emit initial participant count
        const io = req.app.get('io');
        io.to(quiz.id.toString()).emit('participant-count', { count: 0 });

        res.json({ 
            success: true, 
            data: { 
                sessionCode: quiz.sessionCode 
            } 
        });
    } catch (error) {
        console.error('Error starting quiz:', error);
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

        // Get all participants for this quiz
        console.log('Getting participants for quiz:', quiz.id);
        const participants = await Participant.findByQuizId(quiz.id);
        console.log('Found participants:', participants);
        
        // Archive participants' results with their answers
        const currentResults = participants.map(participant => ({
            participantName: participant.name || '',
            score: participant.score || 0,
            completedAt: new Date().toISOString(),
            answers: (participant.answers || []).map(answer => ({
                questionIndex: answer.questionIndex,
                answeredAt: answer.answeredAt,
                isCorrect: answer.isCorrect,
                timeTaken: answer.timeTaken,
                points: answer.points || 0,
                answer: answer.answer // Include which option was selected
            }))
        }));

        console.log('Archiving results:', currentResults);
        const updatedQuiz = await Quiz.endQuiz(req.params.id, currentResults);
        console.log('Quiz ended successfully:', updatedQuiz);

        res.json({ success: true, data: updatedQuiz });
    } catch (error) {
        console.error('Error ending quiz:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Export quiz results
exports.exportQuizResults = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);

        if (!quiz) {
            return res.status(404).json({ success: false, message: 'Quiz not found' });
        }

        // Create workbook
        const wb = xlsx.utils.book_new();
        
        // Participant results worksheet
        const participantData = quiz.archivedResults.map(result => ({
            'Participant Name': result.participantName,
            'Total Score': result.score,
            'Completed At': new Date(result.completedAt).toLocaleString()
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
        const filename = `quiz-results-${quiz.id}.xlsx`;
        const filePath = path.join(__dirname, '..', 'public', 'exports', filename);
        xlsx.writeFile(wb, filePath);

        res.json({
            success: true,
            data: {
                downloadUrl: `/exports/${filename}`
            }
        });
    } catch (error) {
        console.error('Error exporting quiz results:', error);
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
            p => p.participantId === participantId
        );

        if (participantIndex === -1) {
            return res.status(404).json({ success: false, message: 'Participant not found' });
        }

        quiz.activeParticipants[participantIndex].score = score;
        const updatedQuiz = await Quiz.updateActiveParticipants(quizId, quiz.activeParticipants);

        res.json({ success: true, data: updatedQuiz.activeParticipants });
    } catch (error) {
        console.error('Error updating participant score:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
