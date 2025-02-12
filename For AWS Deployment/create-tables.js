const { DynamoDB } = require('@aws-sdk/client-dynamodb');

const dynamodb = new DynamoDB({
    endpoint: 'http://localhost:8000',
    region: 'local',
    credentials: {
        accessKeyId: 'dummy',
        secretAccessKey: 'dummy'
    }
});

async function createTables() {
    try {
        // Delete existing tables if they exist
        try {
            await dynamodb.deleteTable({ TableName: 'Quizzes' });
            await dynamodb.deleteTable({ TableName: 'Participants' });
            console.log('Existing tables deleted');
        } catch (error) {
            // Ignore if tables don't exist
        }

        // Create Quizzes table
        await dynamodb.createTable({
            TableName: 'Quizzes',
            AttributeDefinitions: [
                { AttributeName: 'id', AttributeType: 'S' }
            ],
            KeySchema: [
                { AttributeName: 'id', KeyType: 'HASH' }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        });

        console.log('Quizzes table created');

        // Create Participants table
        await dynamodb.createTable({
            TableName: 'Participants',
            AttributeDefinitions: [
                { AttributeName: 'id', AttributeType: 'S' },
                { AttributeName: 'quizId', AttributeType: 'S' },
                { AttributeName: 'sessionId', AttributeType: 'S' },
                { AttributeName: 'socketId', AttributeType: 'S' }
            ],
            KeySchema: [
                { AttributeName: 'id', KeyType: 'HASH' }
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: 'quizId-index',
                    KeySchema: [
                        { AttributeName: 'quizId', KeyType: 'HASH' }
                    ],
                    Projection: { ProjectionType: 'ALL' },
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 5,
                        WriteCapacityUnits: 5
                    }
                },
                {
                    IndexName: 'sessionId-index',
                    KeySchema: [
                        { AttributeName: 'sessionId', KeyType: 'HASH' }
                    ],
                    Projection: { ProjectionType: 'ALL' },
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 5,
                        WriteCapacityUnits: 5
                    }
                },
                {
                    IndexName: 'socketId-index',
                    KeySchema: [
                        { AttributeName: 'socketId', KeyType: 'HASH' }
                    ],
                    Projection: { ProjectionType: 'ALL' },
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 5,
                        WriteCapacityUnits: 5
                    }
                }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        });

        console.log('Participants table created');
        console.log('All tables created successfully');
    } catch (error) {
        console.error('Error creating tables:', error);
        process.exit(1);
    }
}

createTables();
