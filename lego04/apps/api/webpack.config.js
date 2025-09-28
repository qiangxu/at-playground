const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = function (options) {
  return {
    ...options, // 1. 保留所有 NestJS 的默认 Webpack 配置
    resolve: {
      ...options.resolve, // 2. 保留所有默认的解析配置
      plugins: [
        // 3. 保留可能存在的默认解析插件
        ...(options.resolve.plugins || []),
        // 4. 添加我们的核心插件
        new TsconfigPathsPlugin({
          configFile: './tsconfig.json', // 告诉插件去哪里找 tsconfig.json
        }),
      ],
    },
  };
};