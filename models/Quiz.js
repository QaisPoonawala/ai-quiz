const { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class Quiz {
    static tableName = 'Quizzes';

    static async create(quizData) {
        // Validate input
        if (!quizData.title) {
            throw new Error('Quiz title is required');
        }

        // Ensure all required fields are present
        const quiz = {
            id: uuidv4(),
            title: quizData.title,
            description: quizData.description || '',
            theme: quizData.theme || {
                backgroundColor: '#ffffff',
                textColor: '#333333',
                accentColor: '#007bff'
            },
            questions: quizData.questions ? JSON.parse(JSON.stringify(quizData.questions)) : [],
            isLive: 0,
            currentQuestion: -1,
            sessionCode: '',
            participants: [],
            createdAt: new Date().toISOString(),
            archived: 0,
            activeParticipants: [],
            archivedResults: []
        };

        try {
            await docClient.send(new PutCommand({
                TableName: this.tableName,
                Item: quiz,
                // Add condition to prevent overwriting existing items
                ConditionExpression: 'attribute_not_exists(id)'
            }));

            console.log('Quiz created successfully:', quiz.id);
            return quiz;
        } catch (error) {
            console.error('Error creating quiz:', error);
            
            // Provide more detailed error handling
            if (error.name === 'ConditionalCheckFailedException') {
                throw new Error('A quiz with this ID already exists');
            }
            
            throw error;
        }
    }

    static async findById(id) {
        try {
            const response = await docClient.send(new GetCommand({
                TableName: this.tableName,
                Key: { id }
            }));
            return response.Item;
        } catch (error) {
            console.error('Error finding quiz by ID:', error);
            throw error;
        }
    }

    static async find(conditions = {}) {
        try {
            let params = {
                TableName: this.tableName
            };

            // If archived condition is specified, add a filter expression
            if ('archived' in conditions) {
                params.FilterExpression = 'archived = :archived';
                params.ExpressionAttributeValues = {
                    ':archived': conditions.archived
                };
            }

            // Use scan operation
            const command = new ScanCommand(params);
            const response = await docClient.send(command);
            return response.Items;
        } catch (error) {
            console.error('Error finding quizzes:', error);
            throw error;
        }
    }

    static async findByIdAndUpdate(id, updateData) {
        try {
            // Build update expression and attribute values
            const updateAttrs = {};
            const updateNames = {};
            const updateExpressions = [];

            Object.entries(updateData).forEach(([key, value]) => {
                const attrName = `#${key}`;
                const attrValue = `:${key}`;
                updateNames[attrName] = key;
                updateAttrs[attrValue] = value;
                updateExpressions.push(`${attrName} = ${attrValue}`);
            });

            const params = {
                TableName: this.tableName,
                Key: { id },
                UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                ExpressionAttributeNames: updateNames,
                ExpressionAttributeValues: updateAttrs,
                ReturnValues: 'ALL_NEW'
            };

            const command = new UpdateCommand(params);
            const response = await docClient.send(command);
            return response.Attributes;
        } catch (error) {
            console.error('Error updating quiz:', error);
            throw error;
        }
    }

    static async findByIdAndDelete(id) {
        try {
            const params = {
                TableName: this.tableName,
                Key: { id },
                ReturnValues: 'ALL_OLD'
            };

            const command = new DeleteCommand(params);
            const response = await docClient.send(command);
            return response.Attributes;
        } catch (error) {
            console.error('Error deleting quiz:', error);
            throw error;
        }
    }

    static async startQuiz(id, sessionCode) {
        try {
            const params = {
                TableName: this.tableName,
                Key: { id },
                UpdateExpression: 'SET isLive = :isLive, sessionCode = :sessionCode, currentQuestion = :currentQuestion, activeParticipants = :activeParticipants',
                ExpressionAttributeValues: {
                    ':isLive': 1,
                    ':sessionCode': sessionCode || '',
                    ':currentQuestion': -1,
                    ':activeParticipants': []
                },
                ReturnValues: 'ALL_NEW'
            };

            const command = new UpdateCommand(params);
            const response = await docClient.send(command);
            return response.Attributes;
        } catch (error) {
            console.error('Error starting quiz:', error);
            throw error;
        }
    }

    static async endQuiz(id, results) {
        try {
            // First get the current quiz to merge results
            const quiz = await this.findById(id);
            if (!quiz) {
                throw new Error('Quiz not found');
            }

            // Merge existing archived results with new results
            const existingResults = quiz.archivedResults || [];
            const updatedResults = [...existingResults, ...results];

            const params = {
                TableName: this.tableName,
                Key: { id },
                UpdateExpression: 'SET isLive = :isLive, sessionCode = :sessionCode, currentQuestion = :currentQuestion, activeParticipants = :activeParticipants, archivedResults = :results',
                ExpressionAttributeValues: {
                    ':isLive': 0,
                    ':sessionCode': '',
                    ':currentQuestion': -1,
                    ':activeParticipants': [],
                    ':results': updatedResults
                },
                ReturnValues: 'ALL_NEW'
            };

            console.log('Ending quiz with params:', JSON.stringify(params, null, 2));

            const command = new UpdateCommand(params);
            const response = await docClient.send(command);
            return response.Attributes;
        } catch (error) {
            console.error('Error ending quiz:', error);
            throw error;
        }
    }

    static async updateActiveParticipants(id, participants) {
        try {
            const params = {
                TableName: this.tableName,
                Key: { id },
                UpdateExpression: 'SET activeParticipants = :participants',
                ExpressionAttributeValues: {
                    ':participants': participants
                },
                ReturnValues: 'ALL_NEW'
            };

            const command = new UpdateCommand(params);
            const response = await docClient.send(command);
            return response.Attributes;
        } catch (error) {
            console.error('Error updating active participants:', error);
            throw error;
        }
    }
}

module.exports = Quiz;
