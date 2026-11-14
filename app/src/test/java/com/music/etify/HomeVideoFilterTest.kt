package com.music.etify

import com.music.etify.data.model.HomeShelf
import com.music.etify.data.model.ShelfItem
import com.music.etify.data.model.ShelfLayout
import com.music.etify.data.model.withoutVideos
import org.junit.Assert.assertEquals
import org.junit.Test

class HomeVideoFilterTest {

    private fun item(title: String, isVideo: Boolean = false) = ShelfItem(
        title = title,
        subtitle = "",
        thumbnailUrl = null,
        videoId = title,
        browseId = null,
        isVideo = isVideo,
    )

    @Test
    fun videosComeOutOfAMixedShelf() {
        val shelf = HomeShelf("Quick picks", listOf(item("song"), item("video", isVideo = true)))

        val filtered = listOf(shelf).withoutVideos()

        assertEquals(listOf("song"), filtered.single().items.map { it.title })
    }

    @Test
    fun aShelfLeftEmptyGoesWithThem() {
        val shelf = HomeShelf("Videos", listOf(item("video", isVideo = true)))

        assertEquals(emptyList<HomeShelf>(), listOf(shelf).withoutVideos())
    }

    @Test
    fun aVideoShelfGoesEvenIfARowWasNotMarkedAsOne() {
        val shelf = HomeShelf("Music videos", listOf(item("unmarked")), layout = ShelfLayout.VIDEO)

        assertEquals(emptyList<HomeShelf>(), listOf(shelf).withoutVideos())
    }

    @Test
    fun shelvesWithoutVideosAreUntouched() {
        val shelves = listOf(HomeShelf("Albums", listOf(item("album"))))

        assertEquals(shelves, shelves.withoutVideos())
    }
}
