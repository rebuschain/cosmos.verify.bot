export const formatBulletPointList = (list: string[], title = '') => {
    const body = list.map(item => `• ${item}`).join('\n');

    if (title) {
        return `${title}\n${body}`;
    }

    return body;
}
