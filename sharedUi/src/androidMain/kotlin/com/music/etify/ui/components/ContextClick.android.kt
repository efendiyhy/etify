package com.music.etify.ui.components

import androidx.compose.ui.Modifier

actual fun Modifier.contextClick(onClick: (() -> Unit)?): Modifier = this
