{
  description = "Development environment";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { self, nixpkgs }:
    let
      inherit (nixpkgs) lib;

      systems = [
        "aarch64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
        "x86_64-linux"
      ];

      eachSystem = lib.flip lib.mapAttrs (
        lib.genAttrs systems (system: nixpkgs.legacyPackages.${system})
      );
    in
    {
      devShell = eachSystem (
        system: pkgs:
        pkgs.mkShell {
          packages = [
            pkgs.nodejs
            pkgs.pnpm_9
          ];
        }
      );
    };
}
