buildscript {
  repositories {
    maven("https://maven.aliyun.com/repository/google")
    maven("https://maven.aliyun.com/repository/central")
    maven("https://maven.aliyun.com/repository/gradle-plugin")
    google()
    mavenCentral()
  }
  dependencies {
    classpath("com.android.tools.build:gradle:8.5.2")
  }
}
