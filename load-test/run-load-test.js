const fetch = require('node-fetch');
const { spawn } = require('child_process');
const fs = require('fs').promises;

async function createQuiz() {
    try {
        // Read quiz data
        const quizData = JSON.parse(await fs.readFile('test-quiz.json', 'utf8'));
        
        // Create quiz
        const response = await fetch('http://localhost:5001/api/quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quizData)
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(`Failed to create quiz: ${data.error}`);
        }

        console.log('Quiz created successfully');
        return data.data.id;
    } catch (error) {
        console.error('Error creating quiz:', error);
        process.exit(1);
    }
}

async function startQuiz(quizId) {
    try {
        const response = await fetch(`http://localhost:5001/api/live/start/${quizId}`, {
            method: 'POST'
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(`Failed to start quiz: ${data.error}`);
        }

        console.log('Quiz started successfully');
        return data.data.sessionCode;
    } catch (error) {
        console.error('Error starting quiz:', error);
        process.exit(1);
    }
}

async function nextQuestion(quizId) {
    try {
        const response = await fetch(`http://localhost:5001/api/live/next/${quizId}`, {
            method: 'POST'
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(`Failed to move to next question: ${data.error}`);
        }

        return data.finished;
    } catch (error) {
        console.error('Error moving to next question:', error);
        process.exit(1);
    }
}

async function runTest() {
    // Create and start quiz
    console.log('Creating quiz...');
    const quizId = await createQuiz();
    
    console.log('Starting quiz...');
    const sessionCode = await startQuiz(quizId);

    // Start load test process
    console.log('Starting load test with session code:', sessionCode);
    const loadTest = spawn('node', ['test-load.js', sessionCode], {
        stdio: 'inherit'
    });

    // Wait for participants to join (5 seconds)
    console.log('Waiting for participants to join...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Run through questions
    console.log('Starting questions...');
    let finished = false;
    while (!finished) {
        // Move to next question
        finished = await nextQuestion(quizId);
        
        // Wait for answers (10 seconds per question)
        await new Promise(resolve => setTimeout(resolve, 10000));
    }

    console.log('Quiz completed');
    process.exit(0);
}

// Run the test
runTest().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
