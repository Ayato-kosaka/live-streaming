
export const sendLog = async (screen: string, sessionId: React.MutableRefObject<number> | null, event: string, data: any = {}) => {
    try {
        const payload = {
            timestamp: new Date().toISOString(),
            sessionId: sessionId?.current,
            screen,
            event,
            gitCommit: process.env.EXPO_PUBLIC_GIT_COMMIT,
            data,
        };

        console.log(JSON.stringify(payload));
        await fetch(process.env.EXPO_PUBLIC_GAS_LOG_API_URL!, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        console.error("Failed to send log:", err);
    }
};