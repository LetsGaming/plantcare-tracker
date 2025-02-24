<template>
  <section class="details-banner">
    <ion-img
      :src="imageUrl || '/no-image.png'"
      alt="Plant Image"
      class="details-banner__image"
    />
    <div class="details-banner__content">
      <h2 class="details-banner__title">{{ bannerTitle }}</h2>
      <p class="details-banner__subtitle" v-if="bannerSubtitle">
        {{ bannerSubtitle }}
      </p>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";

import { IonImg } from "@ionic/vue";

export default defineComponent({
  name: "DetailsBanner",
  components: {
    IonImg,
  },
  props: {
    bannerTitle: {
      type: String,
      required: true,
    },
    bannerSubtitle: {
      type: String,
      required: false,
    },
    imageUrl: {
      type: String,
      required: false,
    },
  },
});
</script>

<style scoped>
.details-banner {
  position: relative;
  width: 100%;
  height: 500px;
  overflow: hidden;
}

.details-banner__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.details-banner__content {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px;
  background: rgba(0, 0, 0, 0.5); /* Dark overlay for readability */
  color: white;
  text-align: left;
}

.details-banner__title {
  font-size: 2rem;
  font-weight: bold;
  margin: 0;
}

.details-banner__subtitle {
  font-size: 1.2rem;
  margin-top: 5px;
}
</style>
