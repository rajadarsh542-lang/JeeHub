# Reviewed hints and YouTube links

The optional configuration is public/assets/teaching-links.json. It changes teaching presentation only, not answer keys or the immutable bank pin.

The initial configuration contains independently checked hint sequences and takeaways for the two named practice examples. No channel or video URL was supplied, so those links remain absent. Never put placeholder links in production.

Set channelUrl to the owner's actual HTTPS YouTube channel URL. For an exact question ID, add an entry with reviewed: true only after checking the question and solution. Supported fields:

- hints: an ordered list of plain-text hints. Keep early hints from revealing the answer.
- takeaway: a plain-text concept or common-mistake explanation.
- steps: an optional ordered list of reviewed plain-text solution steps. Existing source material remains available.
- video: an object with url (HTTPS YouTube watch or youtu.be URL), title and startSeconds (integer, 0 to 86400).
- reviewNote: editorial notes, not displayed.

Only reviewed entries appear. Video links are restricted to recognized YouTube video URLs, normalized to an exact video ID and timestamp, and open in a new tab. No video is embedded or autoplayed. Unsupported or missing configuration does not block question loading.

The global QuestionExperience helper provides ready, attach(root, {id}), addHints(actions, container, id), decorateSolution(solution, id), reportAttempt(id, status), markAnswers(fields, correctIds, {numerical, correct}) and clearAnswerFeedback(fields). The question-attempt document event carries {id, status}; status is correct, incorrect or unattempted.
