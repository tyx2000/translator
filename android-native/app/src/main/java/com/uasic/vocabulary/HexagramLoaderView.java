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
  private final ValueAnimator firstAnimator;
  private final ValueAnimator secondAnimator;
  private float firstProgress;
  private float secondProgress;

  HexagramLoaderView(Context context) {
    super(context);
    paint.setColor(Color.rgb(17, 24, 39));
    paint.setStyle(Paint.Style.STROKE);
    paint.setStrokeWidth(dp(2.4f));
    paint.setStrokeJoin(Paint.Join.ROUND);
    paint.setStrokeCap(Paint.Cap.ROUND);
    setBackgroundColor(Color.argb(184, 255, 255, 255));

    firstAnimator = createAnimator(0);
    firstAnimator.addUpdateListener(value -> {
      firstProgress = (float) value.getAnimatedValue();
      invalidate();
    });
    secondAnimator = createAnimator(180);
    secondAnimator.addUpdateListener(value -> {
      secondProgress = (float) value.getAnimatedValue();
      invalidate();
    });
  }

  void start() {
    if (!firstAnimator.isStarted()) firstAnimator.start();
    if (!secondAnimator.isStarted()) secondAnimator.start();
  }

  void stop() {
    firstAnimator.cancel();
    secondAnimator.cancel();
    firstProgress = 0f;
    secondProgress = 0f;
    invalidate();
  }

  private ValueAnimator createAnimator(long delay) {
    ValueAnimator animator = ValueAnimator.ofFloat(0f, 1f);
    animator.setDuration(1_600);
    animator.setStartDelay(delay);
    animator.setRepeatCount(ValueAnimator.INFINITE);
    animator.setInterpolator(new AccelerateDecelerateInterpolator());
    return animator;
  }

  @Override
  protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
    float centerX = width / 2f;
    float centerY = height / 2f;
    float scale = dp(60) / 100f;

    firstTriangle.reset();
    firstTriangle.moveTo(x(centerX, 50, scale), y(centerY, 12, scale));
    firstTriangle.lineTo(x(centerX, 84, scale), y(centerY, 72, scale));
    firstTriangle.lineTo(x(centerX, 16, scale), y(centerY, 72, scale));
    firstTriangle.close();

    secondTriangle.reset();
    secondTriangle.moveTo(x(centerX, 50, scale), y(centerY, 88, scale));
    secondTriangle.lineTo(x(centerX, 16, scale), y(centerY, 28, scale));
    secondTriangle.lineTo(x(centerX, 84, scale), y(centerY, 28, scale));
    secondTriangle.close();
  }

  @Override
  protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    drawProgress(canvas, firstTriangle, firstProgress);
    drawProgress(canvas, secondTriangle, secondProgress);
  }

  private void drawProgress(Canvas canvas, Path path, float pathProgress) {
    float tracedProgress = Math.min(1f, pathProgress / 0.7f);
    PathMeasure measure = new PathMeasure(path, false);
    visiblePath.reset();
    measure.getSegment(0f, measure.getLength() * tracedProgress, visiblePath, true);
    paint.setAlpha(Math.round(255 * (0.25f + 0.75f * tracedProgress)));
    canvas.drawPath(visiblePath, paint);
  }

  private float x(float center, float coordinate, float scale) {
    return center + (coordinate - 50f) * scale;
  }

  private float y(float center, float coordinate, float scale) {
    return center + (coordinate - 50f) * scale;
  }

  private float dp(float value) {
    return value * getResources().getDisplayMetrics().density;
  }
}
