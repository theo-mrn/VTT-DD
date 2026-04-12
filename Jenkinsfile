pipeline{
    agent any

    tools {
  nodejs 'Node_24-14-0'
}
    stages{
        stage('install dependencies'){
            steps{
                sh 'npm install'
                sh 'npm install -g firebase-tools'
            }
        }
        stage('run test'){
            steps{
                sh 'npm run test'
            }
        }
        stage('run test:e2e'){
            steps{
                sh 'npm run test:e2e'
            }
        }
    }
}