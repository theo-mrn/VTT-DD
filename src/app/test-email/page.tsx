import EmailSender from '@/components/EmailSender';

export default function TestEmailPage() {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-900">
            <EmailSender />
        </div>
    );
}
