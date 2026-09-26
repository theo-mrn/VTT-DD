import * as React from 'react';
import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Section,
    Text,
    Hr,
    Button,
} from '@react-email/components';

interface SessionReminderEmailProps {
    firstName: string;
    campaignName: string;
    sessionDate: string;
}

export const SessionReminderEmailTemplate = ({
    firstName,
    campaignName,
    sessionDate,
}: SessionReminderEmailProps) => (
    <Html>
        <Head />
        <Preview>Rappel : session de {campaignName} demain !</Preview>
        <Body style={main}>
            <Container style={container}>
                <Heading style={h1}>📅 Session demain !</Heading>
                <Text style={text}>Salutations, {firstName},</Text>
                <Text style={text}>
                    Ceci est un rappel : votre prochaine session de <strong>{campaignName}</strong> a lieu <strong>demain</strong>.
                </Text>
                <Section style={section}>
                    <Text style={dateText}>
                        🕐 {sessionDate}
                    </Text>
                </Section>
                <Text style={text}>
                    Préparez vos dés, révisez vos sorts et aiguisez vos lames. L'aventure vous attend !
                </Text>
                <Section style={section}>
                    <Button style={button} href="https://yner.fr">
                        Accéder à la campagne
                    </Button>
                </Section>
                <Hr style={hr} />
                <Text style={footer}>
                    Vous recevez cet email car vous faites partie de la campagne {campaignName} sur Yner.
                </Text>
            </Container>
        </Body>
    </Html>
);

const main = {
    backgroundColor: '#f6f9fc',
    fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '20px 0 48px',
    marginBottom: '64px',
};

const h1 = {
    color: '#333',
    fontSize: '24px',
    fontWeight: 'bold',
    textAlign: 'center' as const,
    margin: '30px 0',
    padding: '0',
};

const text = {
    color: '#333',
    fontSize: '16px',
    lineHeight: '26px',
    textAlign: 'left' as const,
    padding: '0 20px',
};

const section = {
    padding: '24px',
    textAlign: 'center' as const,
};

const dateText = {
    color: '#333',
    fontSize: '20px',
    fontWeight: 'bold',
    textAlign: 'center' as const,
    backgroundColor: '#f0f0f0',
    padding: '16px',
    borderRadius: '8px',
    margin: '0 20px',
};

const button = {
    backgroundColor: '#5F51E8',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '16px',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'block',
    width: '100%',
    padding: '12px',
};

const hr = {
    borderColor: '#e6ebf1',
    margin: '20px 0',
};

const footer = {
    color: '#8898aa',
    fontSize: '12px',
    lineHeight: '16px',
    textAlign: 'center' as const,
};
