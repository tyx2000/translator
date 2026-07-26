package com.uasic.vocabulary;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PathMeasure;
import android.view.View;
import android.view.animation.AccelerateDecelerateInterpolator;

final class HexagramLoaderView extends View {
  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Path firstTriangle = new Path();
  private final Path secondTriangle = new Path();
  private final Path visiblePath = new Path();
  private final ValueAnimator animator;
  private float progress;

  HexagramLoaderView(Context context) {
    super(context);
    paint.setColor(Color.rgb(17, 24, 39));
    paint.setStyle(Paint.Style.STROKE);
    paint.setStrokeWidth(dp(3));
    paint.setStrokeJoin(Paint.Join.ROUND);
    paint.setStrokeCap(Paint.Cap.ROUND);
    setBackgroundColor(Color.argb(218, 255, 255, 255));

    animator = ValueAnimator.ofFloat(0f, 1f);
    animator.setDuration(2_000);
    animator.setRepeatCount(ValueAnimator.INFINITE);
    animator.setInterpolator(new AccelerateDecelerateInterpolator());
    animator.addUpdateListener(value -> {
      progress = (float) value.getAnimatedValue();
      invalidate();
    });
  }

  void start() {
    if (!animator.isStarted()) animator.start();
  }

  void stop() {
    animator.cancel();
    progress = 0f;
    invalidate();
  }

  @Override
  protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
    float size = Math.min(width, height) * 0.26f;
    float centerX = width / 2f;
    float centerY = height / 2f;
    float halfWidth = size * 0.5f;
    float halfHeight = size * 0.44f;

    firstTriangle.reset();
    firstTriangle.moveTo(centerX, centerY - halfHeight);
    firstTriangle.lineTo(centerX + halfWidth, centerY + halfHeight);
    firstTriangle.lineTo(centerX - halfWidth, centerY + halfHeight);
    firstTriangle.close();

    secondTriangle.reset();
    secondTriangle.moveTo(centerX, centerY + halfHeight);
    secondTriangle.lineTo(centerX - halfWidth, centerY - halfHeight);
    secondTriangle.lineTo(centerX + halfWidth, centerY - halfHeight);
    secondTriangle.close();
  }

  @Override
  protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    drawProgress(canvas, firstTriangle, progress);
    drawProgress(canvas, secondTriangle, Math.max(0f, (progress - 0.08f) / 0.92f));
  }

  private void drawProgress(Canvas canvas, Path path, float pathProgress) {
    PathMeasure measure = new PathMeasure(path, false);
    visiblePath.reset();
    measure.getSegment(0f, measure.getLength() * pathProgress, visiblePath, true);
    canvas.drawPath(visiblePath, paint);
  }

  private float dp(float value) {
    return value * getResources().getDisplayMetrics().density;
  }
}
