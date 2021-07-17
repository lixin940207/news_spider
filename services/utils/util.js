async function ifSelectorExists(element, selector) {
    return (await element.$$(selector)).length > 0;
}

module.exports = {
    ifSelectorExists,
}
