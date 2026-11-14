package com.music.etify.ui

/** What the current track's provider picker already knows without another request. */
enum class LyricsProviderState {
    NOT_FETCHED,
    FETCHING,
    FOUND,
    NOT_FOUND,
}
